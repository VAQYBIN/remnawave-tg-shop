import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from db.models import Account, User, Subscription
from core.dal import user_dal, subscription_dal
from core.services.panel_client import PanelApiService
from core.services.panel_identity import resolve_panel_user_id


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_panel_expire_at(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _panel_datetime(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _description_from_user(user: User) -> str:
    return "\n".join(
        [
            user.username or "",
            user.first_name or "",
            user.last_name or "",
        ]
    )


async def _ensure_telegram_panel_user(
    session: AsyncSession,
    settings: Settings,
    panel: PanelApiService,
    user: User,
) -> Optional[dict[str, Any]]:
    panel_user_id = await resolve_panel_user_id(session, panel, user)
    if panel_user_id is not None:
        return await panel.get_user_by_id(panel_user_id)

    created = await panel.create_panel_user(
        username_on_panel=f"tg_{user.user_id}",
        telegram_id=user.user_id,
        description=_description_from_user(user),
        specific_squad_uuids=settings.parsed_user_squad_uuids,
        external_squad_uuid=settings.parsed_user_external_squad_uuid,
        default_traffic_limit_bytes=settings.user_traffic_limit_bytes,
        default_traffic_limit_strategy=settings.USER_TRAFFIC_STRATEGY,
    )
    if not created or created.get("error"):
        return None

    panel_user = created.get("response") or {}
    created_id = panel_user.get("id")
    if created_id is None:
        return None

    await user_dal.update_user(
        session, user.user_id, {"panel_user_id": int(created_id)}
    )
    user.panel_user_id = int(created_id)
    return panel_user


async def merge_site_subscription_into_telegram(
    session: AsyncSession,
    settings: Settings,
    *,
    account: Account,
    telegram_user: User,
) -> dict[str, Any]:
    """Merge current account's web-only subscription into its Telegram identity.

    Web-only payments remain attached to account.site_user_id for audit/history.
    The web-only panel user is deleted after the remaining time is transferred.
    """
    if not account.site_user_id:
        return {"merged": False, "reason": "no_site_user"}

    site_user = await user_dal.get_user_by_id(session, account.site_user_id)
    if not site_user:
        return {"merged": False, "reason": "site_user_missing"}

    site_sub = await subscription_dal.get_active_subscription_by_user_id(
        session,
        site_user.user_id,
        site_user.panel_user_id,
    )
    if not site_sub or not site_sub.end_date:
        return {"merged": False, "reason": "no_active_site_subscription"}

    now = _utc_now()
    if site_sub.end_date <= now:
        return {"merged": False, "reason": "site_subscription_expired"}

    panel = PanelApiService(settings)
    try:
        telegram_panel_user = await _ensure_telegram_panel_user(
            session,
            settings,
            panel,
            telegram_user,
        )
        if not telegram_panel_user:
            raise RuntimeError("Failed to ensure Telegram panel user")

        telegram_panel_id = int(telegram_panel_user["id"])
        telegram_panel_sub_uuid = telegram_panel_user.get("shortUuid")
        if not telegram_panel_sub_uuid:
            raise RuntimeError("Telegram panel user has no subscription UUID")

        telegram_sub = await subscription_dal.get_active_subscription_by_user_id(
            session,
            telegram_user.user_id,
            telegram_panel_id,
        )

        remaining = site_sub.end_date - now
        base_end = now
        if telegram_sub and telegram_sub.end_date and telegram_sub.end_date > now:
            base_end = telegram_sub.end_date

        final_end = base_end + remaining

        updated_panel_user = await panel.update_user_details_on_panel(
            telegram_panel_id,
            {
                "telegramId": telegram_user.user_id,
                "expireAt": _panel_datetime(final_end),
                "status": "ACTIVE",
                "trafficLimitBytes": settings.user_traffic_limit_bytes,
                "trafficLimitStrategy": settings.USER_TRAFFIC_STRATEGY,
                "description": _description_from_user(telegram_user),
                **(
                    {"activeInternalSquads": settings.parsed_user_squad_uuids}
                    if settings.parsed_user_squad_uuids
                    else {}
                ),
                **(
                    {"externalSquadUuid": settings.parsed_user_external_squad_uuid}
                    if settings.parsed_user_external_squad_uuid
                    else {}
                ),
            },
        )
        if not updated_panel_user:
            raise RuntimeError("Failed to update Telegram panel user")

        sub_payload = {
            "user_id": telegram_user.user_id,
            "panel_user_id": telegram_panel_id,
            "panel_subscription_uuid": telegram_panel_sub_uuid,
            "start_date": telegram_sub.start_date if telegram_sub else now,
            "end_date": final_end,
            "duration_months": telegram_sub.duration_months if telegram_sub else site_sub.duration_months,
            "is_active": True,
            "status_from_panel": "ACTIVE_MERGED_FROM_WEB",
            "traffic_limit_bytes": settings.user_traffic_limit_bytes,
            "provider": telegram_sub.provider if telegram_sub else site_sub.provider,
            "skip_notifications": False,
            "auto_renew_enabled": telegram_sub.auto_renew_enabled if telegram_sub else False,
        }
        await subscription_dal.upsert_subscription(session, sub_payload)

        await subscription_dal.update_subscription(
            session,
            site_sub.subscription_id,
            {
                "is_active": False,
                "status_from_panel": "MERGED_INTO_TELEGRAM",
                "skip_notifications": True,
            },
        )

        if (
            site_user.panel_user_id is not None
            and site_user.panel_user_id != telegram_panel_id
        ):
            deleted = await panel.delete_user_from_panel(site_user.panel_user_id)
            if not deleted:
                logging.warning(
                    "Failed to delete merged web-only panel user %s",
                    site_user.panel_user_id,
                )
        await user_dal.update_user(session, site_user.user_id, {"panel_user_id": None})

        return {
            "merged": True,
            "final_end_date": final_end,
            "added_seconds": int(remaining.total_seconds()),
        }
    finally:
        await panel.close_session()


async def sync_telegram_panel_identity(
    session: AsyncSession,
    settings: Settings,
    *,
    account: Account,
    telegram_user: User,
) -> dict[str, Any]:
    """Apply the web account identity to an existing Remnawave user.

    This is intentionally non-creating: linking Telegram to a website account
    should not create a panel subscription by itself. It only fixes identity
    fields on the panel user that already exists locally, by telegramId, or by
    the account email.
    """
    panel = PanelApiService(settings)
    try:
        panel_user_id = await resolve_panel_user_id(
            session, panel, telegram_user, account
        )

        if panel_user_id is None and account.email:
            by_email = await panel.get_users_by_filter(email=account.email)
            if by_email and len(by_email) > 1:
                logging.error(
                    "Multiple Remnawave users found for account email during identity sync."
                )
                return {"synced": False, "reason": "multiple_by_email"}
            if by_email:
                panel_user_id = by_email[0].get("id")

        if panel_user_id is None:
            return {"synced": False, "reason": "panel_user_not_found"}
        panel_user_id = int(panel_user_id)

        payload: dict[str, Any] = {
            "telegramId": telegram_user.user_id,
            "description": _description_from_user(telegram_user),
        }
        if account.email:
            payload["email"] = account.email

        updated_panel_user = await panel.update_user_details_on_panel(
            panel_user_id, payload
        )
        if not updated_panel_user:
            return {"synced": False, "reason": "panel_update_failed"}

        if telegram_user.panel_user_id != panel_user_id:
            await user_dal.update_user(
                session, telegram_user.user_id, {"panel_user_id": panel_user_id}
            )
            telegram_user.panel_user_id = panel_user_id

        return {"synced": True, "panel_user_id": panel_user_id}
    finally:
        await panel.close_session()


async def unlink_telegram_from_account(
    session: AsyncSession,
    settings: Settings,
    *,
    account: Account,
) -> bool:
    if not account.telegram_user_id:
        return False

    telegram_user = await user_dal.get_user_by_id(session, account.telegram_user_id)
    if telegram_user and telegram_user.panel_user_id is not None:
        panel = PanelApiService(settings)
        try:
            await panel.update_user_details_on_panel(
                telegram_user.panel_user_id,
                {"telegramId": None},
            )
        finally:
            await panel.close_session()

    from core.dal.account_dal import update_account

    await update_account(session, account.id, telegram_user_id=None)
    return True
