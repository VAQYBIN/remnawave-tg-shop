import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from db.models import Account, User
from core.dal import account_dal, subscription_dal, trial_activation_dal, user_dal
from core.services.panel_client import PanelApiService


@dataclass
class TrialEligibilityResult:
    eligible: bool
    reason: Optional[str] = None
    trial_days: int = 0
    trial_traffic_gb: Optional[float] = None
    user_ids: tuple[int, ...] = ()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _panel_datetime(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _description_from_user(user: User) -> str:
    return "\n".join([user.username or "", user.first_name or "", user.last_name or ""])


async def resolve_trial_identity(
    session: AsyncSession,
    *,
    account: Optional[Account] = None,
    telegram_user_id: Optional[int] = None,
) -> tuple[Optional[Account], list[int], Optional[int], Optional[int]]:
    if account is None and telegram_user_id is not None:
        account = await account_dal.get_account_by_telegram_id(session, telegram_user_id)

    ids: list[int] = []
    tg_id = telegram_user_id
    site_id = None

    if account is not None:
        if account.telegram_user_id is not None:
            tg_id = int(account.telegram_user_id)
        if account.site_user_id is not None:
            site_id = int(account.site_user_id)
        ids.extend(account_dal.get_account_user_ids(account))

    if telegram_user_id is not None and int(telegram_user_id) not in ids:
        ids.append(int(telegram_user_id))

    return account, ids, tg_id, site_id


async def check_trial_eligibility(
    session: AsyncSession,
    settings: Settings,
    *,
    account: Optional[Account] = None,
    telegram_user_id: Optional[int] = None,
) -> TrialEligibilityResult:
    account, user_ids, tg_id, site_id = await resolve_trial_identity(
        session,
        account=account,
        telegram_user_id=telegram_user_id,
    )

    if not settings.TRIAL_ENABLED or settings.TRIAL_DURATION_DAYS <= 0:
        return TrialEligibilityResult(
            eligible=False,
            reason="disabled",
            trial_days=settings.TRIAL_DURATION_DAYS,
            trial_traffic_gb=settings.TRIAL_TRAFFIC_LIMIT_GB,
            user_ids=tuple(user_ids),
        )

    has_admin_reset_grant = await trial_activation_dal.has_unused_trial_reset_grant(
        session,
        account_id=account.id if account else None,
        user_ids=user_ids,
        telegram_user_id=tg_id,
        site_user_id=site_id,
    )

    if await trial_activation_dal.has_active_trial_activation(
        session,
        account_id=account.id if account else None,
        user_ids=user_ids,
        telegram_user_id=tg_id,
        site_user_id=site_id,
    ):
        return TrialEligibilityResult(
            eligible=False,
            reason="already_used",
            trial_days=settings.TRIAL_DURATION_DAYS,
            trial_traffic_gb=settings.TRIAL_TRAFFIC_LIMIT_GB,
            user_ids=tuple(user_ids),
        )

    if not has_admin_reset_grant:
        for user_id in user_ids:
            if await subscription_dal.has_any_subscription_for_user(session, user_id):
                return TrialEligibilityResult(
                    eligible=False,
                    reason="has_subscription",
                    trial_days=settings.TRIAL_DURATION_DAYS,
                    trial_traffic_gb=settings.TRIAL_TRAFFIC_LIMIT_GB,
                    user_ids=tuple(user_ids),
                )

    return TrialEligibilityResult(
        eligible=True,
        trial_days=settings.TRIAL_DURATION_DAYS,
        trial_traffic_gb=settings.TRIAL_TRAFFIC_LIMIT_GB,
        user_ids=tuple(user_ids),
    )


async def _get_or_create_panel_user_link_details(
    session: AsyncSession,
    settings: Settings,
    panel: PanelApiService,
    user_id: int,
    db_user: User,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    current_panel_uuid = db_user.panel_user_uuid
    is_site_user = user_id < 0

    site_email = None
    site_account = None
    if is_site_user:
        site_account = await account_dal.get_account_by_site_user_id(session, user_id)
        site_email = site_account.email if site_account else None

    if is_site_user:
        panel_username = (
            account_dal.web_panel_username(site_account)
            if site_account
            else f"web_{abs(user_id)}"
        )
    else:
        panel_username = f"tg_{user_id}"

    panel_user: Optional[dict[str, Any]] = None
    if is_site_user and site_email:
        by_email = await panel.get_users_by_filter(email=site_email)
        if by_email and len(by_email) == 1:
            panel_user = by_email[0]
        elif by_email and len(by_email) > 1:
            logging.error("Multiple panel users found for web-only email %s", site_email)
            return None, None, None

    if not is_site_user:
        by_tg = await panel.get_users_by_filter(telegram_id=user_id)
        if by_tg and len(by_tg) == 1:
            panel_user = by_tg[0]
        elif by_tg and len(by_tg) > 1:
            logging.error("Multiple panel users found for telegramId %s", user_id)
            return None, None, None

    if not panel_user and current_panel_uuid:
        panel_user = await panel.get_user_by_uuid(current_panel_uuid)

    if not panel_user:
        created = await panel.create_panel_user(
            username_on_panel=panel_username,
            telegram_id=None if is_site_user else user_id,
            email=site_email if is_site_user else None,
            description=_description_from_user(db_user),
            specific_squad_uuids=settings.parsed_user_squad_uuids,
            external_squad_uuid=settings.parsed_user_external_squad_uuid,
            default_traffic_limit_bytes=settings.user_traffic_limit_bytes,
            default_traffic_limit_strategy=settings.USER_TRAFFIC_STRATEGY,
            hwid_device_limit=settings.TRIAL_HWID_DEVICE_LIMIT,
        )
        if created and not created.get("error") and created.get("response"):
            panel_user = created["response"]
        elif created and created.get("errorCode") == "A019":
            by_username = await panel.get_users_by_filter(username=panel_username)
            if by_username and len(by_username) == 1:
                panel_user = by_username[0]

    panel_uuid = panel_user.get("uuid") if panel_user else None
    if not panel_uuid:
        return None, None, None

    if current_panel_uuid != panel_uuid:
        await user_dal.update_user(session, user_id, {"panel_user_uuid": panel_uuid})
        db_user.panel_user_uuid = panel_uuid

    if not is_site_user:
        panel_tg = panel_user.get("telegramId")
        try:
            panel_tg_int = int(panel_tg) if panel_tg is not None else None
        except (TypeError, ValueError):
            panel_tg_int = None
        if panel_tg_int != user_id:
            await panel.update_user_details_on_panel(
                panel_uuid,
                {"uuid": panel_uuid, "telegramId": user_id, "description": _description_from_user(db_user)},
            )

    panel_sub_uuid = panel_user.get("subscriptionUuid") or panel_user.get("shortUuid")
    panel_short_uuid = panel_user.get("shortUuid")
    return panel_uuid, panel_sub_uuid, panel_short_uuid


def _build_panel_update_payload(
    settings: Settings,
    *,
    panel_user_uuid: str,
    expire_at: datetime,
    traffic_limit_bytes: int,
    description: str,
    telegram_user_id: Optional[int] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "uuid": panel_user_uuid,
        "expireAt": _panel_datetime(expire_at),
        "status": "ACTIVE",
        "trafficLimitBytes": traffic_limit_bytes,
        "trafficLimitStrategy": settings.USER_TRAFFIC_STRATEGY,
        "description": description,
    }
    hwid_limit = settings.TRIAL_HWID_DEVICE_LIMIT
    if hwid_limit is not None and int(hwid_limit) >= 0:
        payload["hwidDeviceLimit"] = int(hwid_limit)

    if telegram_user_id is not None:
        payload["telegramId"] = telegram_user_id
    if settings.parsed_user_squad_uuids:
        payload["activeInternalSquads"] = settings.parsed_user_squad_uuids
    if settings.parsed_user_external_squad_uuid:
        payload["externalSquadUuid"] = settings.parsed_user_external_squad_uuid
    return payload


async def _activate_trial_for_user_id(
    session: AsyncSession,
    settings: Settings,
    *,
    user_id: int,
    source: str,
    account: Optional[Account],
    telegram_user_id: Optional[int],
    site_user_id: Optional[int],
    commit: bool,
) -> dict[str, Any]:
    db_user = await user_dal.get_user_by_id(session, user_id)
    if not db_user:
        return {"eligible": False, "activated": False, "message_key": "user_not_found_for_trial"}

    panel = PanelApiService(settings)
    try:
        panel_user_uuid, panel_sub_uuid, panel_short_uuid = await _get_or_create_panel_user_link_details(
            session,
            settings,
            panel,
            user_id,
            db_user,
        )
        if not panel_user_uuid or not panel_sub_uuid:
            return {
                "eligible": True,
                "activated": False,
                "message_key": "trial_activation_failed_panel_link",
            }

        now = _utc_now()
        current_active_sub = await subscription_dal.get_active_subscription_by_user_id(
            session,
            user_id,
            panel_user_uuid,
        )
        start_date = now
        end_date = now + timedelta(days=settings.TRIAL_DURATION_DAYS)
        sub_status = "TRIAL"
        sub_duration_months = 0
        sub_provider = None
        traffic_limit_bytes = settings.trial_traffic_limit_bytes
        if current_active_sub and current_active_sub.end_date and current_active_sub.end_date > now:
            start_date = current_active_sub.end_date
            end_date = current_active_sub.end_date + timedelta(days=settings.TRIAL_DURATION_DAYS)
            sub_status = "ACTIVE_TRIAL_EXTENDED"
            sub_duration_months = current_active_sub.duration_months
            sub_provider = current_active_sub.provider
            traffic_limit_bytes = current_active_sub.traffic_limit_bytes or settings.user_traffic_limit_bytes

        await subscription_dal.deactivate_other_active_subscriptions(
            session, panel_user_uuid, panel_sub_uuid
        )
        sub = await subscription_dal.upsert_subscription(
            session,
            {
                "user_id": user_id,
                "panel_user_uuid": panel_user_uuid,
                "panel_subscription_uuid": panel_sub_uuid,
                "start_date": start_date,
                "end_date": end_date,
                "duration_months": sub_duration_months,
                "is_active": True,
                "status_from_panel": sub_status,
                "traffic_limit_bytes": traffic_limit_bytes,
                "provider": sub_provider,
                "auto_renew_enabled": False,
            },
        )

        updated_panel_user = await panel.update_user_details_on_panel(
            panel_user_uuid,
            _build_panel_update_payload(
                settings,
                panel_user_uuid=panel_user_uuid,
                expire_at=end_date,
                traffic_limit_bytes=traffic_limit_bytes,
                description=_description_from_user(db_user),
                telegram_user_id=telegram_user_id if user_id > 0 else None,
            ),
        )
        if not updated_panel_user or updated_panel_user.get("error"):
            await session.rollback()
            return {
                "eligible": True,
                "activated": False,
                "message_key": "trial_activation_failed_panel_update",
            }

        await trial_activation_dal.create_trial_activation(
            session,
            account_id=account.id if account else None,
            user_id=user_id,
            telegram_user_id=telegram_user_id,
            site_user_id=site_user_id,
            source=source,
        )
        await trial_activation_dal.consume_trial_reset_grants(
            session,
            account_id=account.id if account else None,
            user_ids=[user_id],
            telegram_user_id=telegram_user_id,
            site_user_id=site_user_id,
        )

        if commit:
            await session.commit()

        return {
            "eligible": True,
            "activated": True,
            "subscription_id": sub.subscription_id,
            "start_date": start_date,
            "end_date": end_date,
            "days": settings.TRIAL_DURATION_DAYS,
            "duration_months": sub_duration_months,
            "status_from_panel": sub_status,
            "provider": sub_provider,
            "traffic_gb": settings.TRIAL_TRAFFIC_LIMIT_GB,
            "traffic_limit_bytes": traffic_limit_bytes,
            "traffic_used_bytes": sub.traffic_used_bytes,
            "panel_user_uuid": panel_user_uuid,
            "panel_short_uuid": updated_panel_user.get("shortUuid", panel_short_uuid),
            "panel_subscription_uuid": updated_panel_user.get("subscriptionUuid") or panel_sub_uuid,
            "subscription_url": updated_panel_user.get("subscriptionUrl"),
        }
    except Exception:
        await session.rollback()
        logging.exception("Trial activation failed for user %s", user_id)
        return {
            "eligible": True,
            "activated": False,
            "message_key": "trial_activation_failed",
        }
    finally:
        await panel.close_session()


async def activate_trial_for_account(
    session: AsyncSession,
    settings: Settings,
    *,
    account: Account,
    commit: bool = False,
) -> dict[str, Any]:
    eligibility = await check_trial_eligibility(session, settings, account=account)
    if not eligibility.eligible:
        message_key = (
            "trial_feature_disabled"
            if eligibility.reason == "disabled"
            else "trial_already_had_subscription_or_trial"
        )
        return {"eligible": False, "activated": False, "reason": eligibility.reason, "message_key": message_key}

    if account.telegram_user_id is not None:
        user_id = int(account.telegram_user_id)
    else:
        site_user = await account_dal.ensure_site_user_for_account(session, account)
        user_id = int(site_user.user_id)

    _, _, tg_id, site_id = await resolve_trial_identity(session, account=account)
    if user_id < 0:
        site_id = user_id

    return await _activate_trial_for_user_id(
        session,
        settings,
        user_id=user_id,
        source="web",
        account=account,
        telegram_user_id=tg_id,
        site_user_id=site_id,
        commit=commit,
    )


async def activate_trial_for_telegram_user(
    session: AsyncSession,
    settings: Settings,
    *,
    telegram_user_id: int,
    commit: bool = True,
) -> dict[str, Any]:
    eligibility = await check_trial_eligibility(
        session,
        settings,
        telegram_user_id=telegram_user_id,
    )
    if not eligibility.eligible:
        message_key = (
            "trial_feature_disabled"
            if eligibility.reason == "disabled"
            else "trial_already_had_subscription_or_trial"
        )
        return {"eligible": False, "activated": False, "reason": eligibility.reason, "message_key": message_key}

    account, _, tg_id, site_id = await resolve_trial_identity(
        session,
        telegram_user_id=telegram_user_id,
    )

    return await _activate_trial_for_user_id(
        session,
        settings,
        user_id=telegram_user_id,
        source="bot",
        account=account,
        telegram_user_id=tg_id or telegram_user_id,
        site_user_id=site_id,
        commit=commit,
    )


async def sync_trial_identity_on_telegram_link(
    session: AsyncSession,
    *,
    account: Account,
    telegram_user_id: int,
) -> None:
    await trial_activation_dal.attach_account_identity_to_telegram_trials(
        session,
        account_id=account.id,
        telegram_user_id=telegram_user_id,
        site_user_id=account.site_user_id,
    )
    await trial_activation_dal.attach_telegram_identity_to_account_trials(
        session,
        account_id=account.id,
        telegram_user_id=telegram_user_id,
        site_user_id=account.site_user_id,
    )


async def reset_trial_for_user_identity(
    session: AsyncSession,
    *,
    user_id: int,
    reset_by_admin_id: Optional[int] = None,
) -> list[int]:
    account: Optional[Account] = None
    if user_id > 0:
        account = await account_dal.get_account_by_telegram_id(session, user_id)
    else:
        account = await account_dal.get_account_by_site_user_id(session, user_id)

    user_ids = [user_id]
    if account:
        for linked_user_id in account_dal.get_account_user_ids(account):
            if linked_user_id not in user_ids:
                user_ids.append(linked_user_id)

    await trial_activation_dal.reset_trial_activations(
        session,
        account_id=account.id if account else None,
        user_ids=user_ids,
        telegram_user_id=account.telegram_user_id if account else (user_id if user_id > 0 else None),
        site_user_id=account.site_user_id if account else (user_id if user_id < 0 else None),
        reset_by_admin_id=reset_by_admin_id,
    )
    for linked_user_id in user_ids:
        await subscription_dal.delete_trial_subscriptions_for_user(session, linked_user_id)
    await trial_activation_dal.create_trial_reset_grant(
        session,
        user_id=user_id,
        account_id=account.id if account else None,
        telegram_user_id=account.telegram_user_id if account else (user_id if user_id > 0 else None),
        site_user_id=account.site_user_id if account else (user_id if user_id < 0 else None),
        granted_by_admin_id=reset_by_admin_id,
    )
    return user_ids
