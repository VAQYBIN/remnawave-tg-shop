import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db, get_redis
from core.dal.account_dal import get_account_user_ids
from web.schemas.subscription import (
    AutoRenewRequest,
    AutoRenewResponse,
    AutoRenewEntitlementRequest,
    ConnectionResponse,
    RenewalBundleResponse,
    RenewalBundleAddonResponse,
    TimePlan,
    TrialEligibilityResponse,
    TrafficPlan,
    SubscriptionPlansResponse,
    SubscriptionResponse,
    PubPlanResponse,
    PubPlanOptionResponse,
    EntitlementResponse,
    EntitlementsResponse,
    AddonsListResponse,
    AddonPlanResponse,
    AddonPlanOptionResponse,
)
from web.middleware.rate_limit import check_rate_limit, get_client_ip

router = APIRouter(prefix="/subscription", tags=["subscription"])


async def _restore_panel_subscription_for_user(
    db: AsyncSession,
    settings: Settings,
    account: Account,
    user_id: int,
    panel_user_uuid: str,
):
    if not settings.PANEL_API_URL or not settings.PANEL_API_KEY:
        return None

    import httpx
    from core.dal import subscription_dal, trial_activation_dal

    url = f"{settings.PANEL_API_URL.rstrip('/')}/users/{panel_user_uuid}"
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.PANEL_API_KEY}",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, headers=headers)
    except Exception as exc:
        logger.warning("Panel subscription restore request failed for %s: %s", panel_user_uuid, exc)
        return None

    if resp.status_code != 200:
        return None

    panel_data = resp.json().get("response", {})
    panel_status = str(panel_data.get("status") or "UNKNOWN").upper()
    panel_expire_at = panel_data.get("expireAt")
    panel_sub_uuid = panel_data.get("subscriptionUuid") or panel_data.get("shortUuid")
    if panel_status != "ACTIVE" or not panel_expire_at or not panel_sub_uuid:
        return None

    try:
        end_date = datetime.fromisoformat(panel_expire_at.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if end_date <= datetime.now(timezone.utc):
        return None

    user_ids = get_account_user_ids(account)
    has_active_trial = await trial_activation_dal.has_active_trial_activation(
        db,
        account_id=account.id,
        user_ids=user_ids,
        telegram_user_id=account.telegram_user_id,
        site_user_id=account.site_user_id,
    )
    sub_payload = {
        "user_id": user_id,
        "panel_user_uuid": panel_user_uuid,
        "panel_subscription_uuid": panel_sub_uuid,
        "start_date": None,
        "end_date": end_date,
        "duration_months": 0 if has_active_trial else None,
        "is_active": True,
        "status_from_panel": "TRIAL" if has_active_trial else "ACTIVE_RESTORED_FROM_PANEL",
        "traffic_limit_bytes": panel_data.get("trafficLimitBytes", settings.user_traffic_limit_bytes),
        "traffic_used_bytes": (panel_data.get("userTraffic") or {}).get("usedTrafficBytes"),
        "auto_renew_enabled": False,
        "provider": None if has_active_trial else "panel_sync",
    }
    logger.warning(
        "Restoring missing local subscription for account %s user %s from panel uuid %s",
        account.id,
        user_id,
        panel_user_uuid,
    )
    return await subscription_dal.upsert_subscription(db, sub_payload)


async def _get_account_active_subscription(db: AsyncSession, account: Account, settings: Settings):
    from core.dal.subscription_dal import get_active_subscription_by_user_id
    from core.dal.user_dal import get_user_by_id

    user_ids = get_account_user_ids(account)
    for user_id in user_ids:
        user = await get_user_by_id(db, user_id)
        sub = await get_active_subscription_by_user_id(
            db,
            user_id,
            user.panel_user_uuid if user else None,
        )
        if sub:
            return sub
        if user and user.panel_user_uuid:
            restored = await _restore_panel_subscription_for_user(
                db,
                settings,
                account,
                user_id,
                user.panel_user_uuid,
            )
            if restored:
                return restored
    return None


def _entitlement_to_response(e) -> EntitlementResponse:
    return EntitlementResponse(
        id=e.id,
        plan_id=e.plan_id,
        plan_option_id=e.plan_option_id,
        plan_slug=e.plan.slug,
        plan_name_ru=e.plan.name_ru,
        plan_name_en=e.plan.name_en,
        plan_kind=e.plan.plan_kind,
        billing_model=e.plan.billing_model,
        starts_at=e.starts_at,
        ends_at=e.ends_at,
        traffic_limit_bytes_added=e.traffic_limit_bytes_added,
        is_active=e.is_active,
        auto_renew_enabled=e.auto_renew_enabled,
    )


@router.get("", response_model=SubscriptionResponse)
async def get_subscription(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubscriptionResponse:
    if not get_account_user_ids(account):
        raise HTTPException(status_code=404, detail="No subscription found")

    sub = await _get_account_active_subscription(db, account, settings)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    # Fetch real-time traffic from panel
    traffic_limit = sub.traffic_limit_bytes
    traffic_used = sub.traffic_used_bytes
    if settings.PANEL_API_URL and settings.PANEL_API_KEY:
        import httpx
        try:
            url = f"{settings.PANEL_API_URL.rstrip('/')}/users/{sub.panel_user_uuid}"
            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {settings.PANEL_API_KEY}",
                "X-Forwarded-Proto": "https",
                "X-Forwarded-For": "127.0.0.1",
                "X-Real-IP": "127.0.0.1",
            }
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                panel_data = resp.json().get("response", {})
                traffic_limit = panel_data.get("trafficLimitBytes", traffic_limit)
                traffic_used = panel_data.get("usedTrafficBytes") or \
                    (panel_data.get("userTraffic") or {}).get("usedTrafficBytes", traffic_used)
        except Exception:
            pass  # Fall back to DB values

    return SubscriptionResponse(
        subscription_id=sub.subscription_id,
        is_active=sub.is_active,
        start_date=sub.start_date,
        end_date=sub.end_date,
        duration_months=sub.duration_months,
        status_from_panel=sub.status_from_panel,
        traffic_limit_bytes=traffic_limit,
        traffic_used_bytes=traffic_used,
        auto_renew_enabled=sub.auto_renew_enabled,
        auto_renew_available=settings.yookassa_autopayments_active,
        provider=sub.provider,
        panel_user_uuid=sub.panel_user_uuid,
        panel_subscription_uuid=sub.panel_subscription_uuid,
    )


@router.get("/trial-eligibility", response_model=TrialEligibilityResponse)
async def get_trial_eligibility(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TrialEligibilityResponse:
    from core.services.trial_core import check_trial_eligibility

    result = await check_trial_eligibility(db, settings, account=account)
    return TrialEligibilityResponse(
        eligible=result.eligible,
        trial_days=result.trial_days,
        trial_traffic_gb=result.trial_traffic_gb,
        reason=result.reason,
    )


@router.post("/trial", response_model=SubscriptionResponse)
async def activate_trial(
    request: Request,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    redis=Depends(get_redis),
) -> SubscriptionResponse:
    from core.services.trial_core import activate_trial_for_account

    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:subscription:trial:{account.id}:{ip}", max_requests=3, window_seconds=3600)

    result = await activate_trial_for_account(db, settings, account=account)
    if not result.get("activated"):
        reason = result.get("reason")
        if reason == "disabled":
            raise HTTPException(status_code=403, detail="Trial is disabled")
        if reason in {"already_used", "has_subscription"}:
            raise HTTPException(status_code=409, detail="Trial already used or subscription exists")
        raise HTTPException(status_code=502, detail=result.get("message_key", "Trial activation failed"))

    return SubscriptionResponse(
        subscription_id=result["subscription_id"],
        is_active=True,
        start_date=result.get("start_date"),
        end_date=result["end_date"],
        duration_months=result.get("duration_months", 0),
        status_from_panel=result.get("status_from_panel", "TRIAL"),
        traffic_limit_bytes=result.get("traffic_limit_bytes"),
        traffic_used_bytes=result.get("traffic_used_bytes"),
        auto_renew_enabled=False,
        auto_renew_available=settings.yookassa_autopayments_active,
        provider=result.get("provider"),
        panel_user_uuid=result["panel_user_uuid"],
        panel_subscription_uuid=result.get("panel_subscription_uuid"),
    )


async def _get_optional_account(request: Request, db: AsyncSession, settings: Settings):
    """Возвращает Account, если в запросе есть валидный JWT.

    Если заголовка Authorization нет — возвращает None (анонимный публичный доступ).
    Если токен присутствует, но недействителен/просрочен — бросает 401, чтобы
    фронтенд-клиент выполнил refresh (он триггерится именно на 401).
    """
    import jwt as _jwt

    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    if not settings.WEB_JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT not configured")

    from web.auth.jwt_service import verify_access_token
    from core.dal.account_dal import get_account_by_id
    try:
        payload = verify_access_token(token, settings.WEB_JWT_SECRET)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except _jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    import uuid as _uuid
    try:
        account_id = _uuid.UUID(sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid account ID in token")
    account = await get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=401, detail="Account not found")
    return account


@router.get("/plans", response_model=SubscriptionPlansResponse)
async def get_plans(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubscriptionPlansResponse:
    if settings.traffic_sale_mode:
        plans = [
            TrafficPlan(gb=gb, price_rub=price)
            for gb, price in sorted(settings.traffic_packages.items())
        ]
        return SubscriptionPlansResponse(mode="traffic", plans=plans, catalog_plans=[])

    # Try DB — catalog mode when non-legacy standalone plans exist
    from core.dal.pricing_plan_dal import get_plans as dal_get_plans, get_plan_by_id, LEGACY_DEFAULT_SLUG
    db_plans = await dal_get_plans(db, enabled_only=True, include_archived=False)
    standalone_plans = [p for p in db_plans if p.plan_kind == "standalone" and not p.is_trial]

    # Если у пользователя активный standalone на архивный план — показываем его в каталоге для продления
    account = await _get_optional_account(request, db, settings)
    if account:
        from core.dal.plan_entitlement_dal import get_active_standalone_entitlement
        user_ids = get_account_user_ids(account)
        now = datetime.now(timezone.utc)
        for user_id in user_ids:
            ent = await get_active_standalone_entitlement(db, user_id, now=now)
            if ent and ent.plan and ent.plan.is_archived:
                archived_plan = await get_plan_by_id(db, ent.plan_id)
                if (
                    archived_plan
                    and archived_plan.plan_kind == "standalone"
                    and any(o.is_enabled for o in (archived_plan.options or []))
                    and not any(p.id == archived_plan.id for p in standalone_plans)
                ):
                    standalone_plans.append(archived_plan)
                break

    if standalone_plans:
        catalog = [
            PubPlanResponse(
                id=p.id,
                slug=p.slug,
                name_ru=p.name_ru,
                name_en=p.name_en,
                description_ru=p.description_ru,
                description_en=p.description_en,
                plan_kind=p.plan_kind,
                billing_model=p.billing_model,
                traffic_reset_strategy=p.traffic_reset_strategy,
                min_price_rub=p.min_price_rub,
                min_price_stars=p.min_price_stars,
                is_trial=p.is_trial,
                options=[
                    PubPlanOptionResponse(
                        id=opt.id,
                        duration_months=opt.duration_months,
                        duration_days=opt.duration_days,
                        traffic_gb=opt.traffic_gb,
                        traffic_unlimited=opt.traffic_unlimited,
                        price_rub=opt.price_rub,
                        price_stars=opt.price_stars,
                        sort_order=opt.sort_order,
                    )
                    for opt in p.options
                    if opt.is_enabled
                ],
            )
            for p in standalone_plans
        ]
        return SubscriptionPlansResponse(mode="catalog", plans=[], catalog_plans=catalog)

    # Legacy fallback: env vars
    legacy_plans = [
        TimePlan(months=months, price_rub=price)
        for months, price in sorted(settings.subscription_options.items())
    ]
    return SubscriptionPlansResponse(mode="time", plans=legacy_plans, catalog_plans=[])


@router.get("/entitlements", response_model=EntitlementsResponse)
async def get_entitlements(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EntitlementsResponse:
    from core.dal.plan_entitlement_dal import get_active_entitlements_for_user

    auto_renew_available = settings.yookassa_autopayments_active

    user_ids = get_account_user_ids(account)
    if not user_ids:
        return EntitlementsResponse(standalone=None, addons=[], auto_renew_available=auto_renew_available)

    now = datetime.now(timezone.utc)
    standalone = None
    addons: list[EntitlementResponse] = []

    for user_id in user_ids:
        entitlements = await get_active_entitlements_for_user(db, user_id, now=now)
        for e in entitlements:
            resp = _entitlement_to_response(e)
            if e.plan.plan_kind == "standalone":
                if standalone is None:
                    standalone = resp
            else:
                addons.append(resp)

    return EntitlementsResponse(
        standalone=standalone,
        addons=addons,
        auto_renew_available=auto_renew_available,
    )


@router.patch("/entitlements/{entitlement_id}/auto-renew", response_model=EntitlementResponse)
async def toggle_entitlement_auto_renew(
    entitlement_id: int,
    body: AutoRenewEntitlementRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EntitlementResponse:
    from core.dal.plan_entitlement_dal import get_entitlement_by_id

    if body.enabled and not settings.yookassa_autopayments_active:
        raise HTTPException(status_code=403, detail="Auto-renew is disabled")

    e = await get_entitlement_by_id(db, entitlement_id)
    if e is None or not e.is_active:
        raise HTTPException(status_code=404, detail="Entitlement not found")

    user_ids = get_account_user_ids(account)
    if e.user_id not in user_ids:
        raise HTTPException(status_code=403, detail="Forbidden")

    e.auto_renew_enabled = body.enabled
    await db.flush()
    await db.commit()
    await db.refresh(e)

    return _entitlement_to_response(e)


@router.get("/renewal-bundle/{option_id}", response_model=RenewalBundleResponse)
async def get_renewal_bundle(
    option_id: int,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> RenewalBundleResponse:
    from core.dal.pricing_plan_dal import get_plan_option_by_id
    from core.services.tariff_renewal_bundle import build_standalone_renewal_bundle

    user_ids = get_account_user_ids(account)
    if not user_ids:
        return RenewalBundleResponse(has_bundle=False)

    option = await get_plan_option_by_id(db, option_id)
    if option is None or option.plan is None or option.plan.plan_kind != "standalone":
        raise HTTPException(status_code=404, detail="Option not found")

    now = datetime.now(timezone.utc)
    for user_id in user_ids:
        bundle = await build_standalone_renewal_bundle(
            db,
            user_id=user_id,
            standalone_option=option,
            now=now,
        )
        if bundle:
            snapshot = bundle["snapshot"]
            return RenewalBundleResponse(
                has_bundle=True,
                total_price_rub=bundle["total_price_rub"],
                total_price_stars=bundle["total_price_stars"],
                addons=[
                    RenewalBundleAddonResponse(
                        entitlement_id=item["entitlement_id"],
                        plan_id=item["plan_id"],
                        option_id=item["option_id"],
                        price_rub=item.get("price_rub"),
                        price_stars=item.get("price_stars"),
                    )
                    for item in snapshot.get("addons", [])
                ],
            )

    return RenewalBundleResponse(has_bundle=False)


@router.get("/addons", response_model=AddonsListResponse)
async def get_addons(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AddonsListResponse:
    from core.dal.plan_entitlement_dal import get_active_standalone_entitlement
    from core.dal.pricing_plan_dal import get_plans as dal_get_plans
    from core.services.tariff_pricing import prorate_option

    user_ids = get_account_user_ids(account)
    if not user_ids:
        return AddonsListResponse(addons=[], standalone_ends_at=None)

    now = datetime.now(timezone.utc)
    standalone_ends_at = None

    for user_id in user_ids:
        standalone = await get_active_standalone_entitlement(db, user_id, now=now)
        if standalone and standalone.ends_at:
            standalone_ends_at = standalone.ends_at
            break

    if standalone_ends_at is None:
        return AddonsListResponse(addons=[], standalone_ends_at=None)

    db_plans = await dal_get_plans(db, enabled_only=True, include_archived=False)
    addon_plans = [p for p in db_plans if p.plan_kind == "addon"]

    result: list[AddonPlanResponse] = []
    for plan in addon_plans:
        enabled_options = [opt for opt in plan.options if opt.is_enabled]
        if not enabled_options:
            continue

        priced_options: list[AddonPlanOptionResponse] = []
        for opt in enabled_options:
            prorated_rub, prorated_stars = prorate_option(
                price_rub=opt.price_rub,
                price_stars=opt.price_stars,
                duration_months=opt.duration_months,
                duration_days=opt.duration_days,
                plan_min_price_rub=plan.min_price_rub,
                plan_min_price_stars=plan.min_price_stars,
                standalone_ends_at=standalone_ends_at,
                now=now,
                global_min_rub=settings.MIN_PRORATED_PRICE_RUB,
                global_min_stars=settings.MIN_PRORATED_PRICE_STARS,
            )
            priced_options.append(AddonPlanOptionResponse(
                id=opt.id,
                duration_months=opt.duration_months,
                duration_days=opt.duration_days,
                traffic_gb=opt.traffic_gb,
                traffic_unlimited=opt.traffic_unlimited,
                price_rub=opt.price_rub,
                price_stars=opt.price_stars,
                sort_order=opt.sort_order,
                prorated_price_rub=prorated_rub,
                prorated_price_stars=prorated_stars,
            ))

        result.append(AddonPlanResponse(
            id=plan.id,
            slug=plan.slug,
            name_ru=plan.name_ru,
            name_en=plan.name_en,
            description_ru=plan.description_ru,
            description_en=plan.description_en,
            billing_model=plan.billing_model,
            traffic_reset_strategy=plan.traffic_reset_strategy,
            min_price_rub=plan.min_price_rub,
            min_price_stars=plan.min_price_stars,
            is_trial=plan.is_trial,
            options=priced_options,
        ))

    return AddonsListResponse(addons=result, standalone_ends_at=standalone_ends_at)


@router.get("/connection", response_model=ConnectionResponse)
async def get_connection(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ConnectionResponse:
    if not get_account_user_ids(account):
        raise HTTPException(status_code=404, detail="No subscription found")

    sub = await _get_account_active_subscription(db, account, settings)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    if not settings.PANEL_API_URL:
        raise HTTPException(status_code=503, detail="Panel URL not configured")

    import httpx
    url = f"{settings.PANEL_API_URL.rstrip('/')}/users/{sub.panel_user_uuid}"
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.PANEL_API_KEY}",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
    except Exception as exc:
        logger.error("Panel request failed url=%s error=%s: %s", url, type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail="Panel unreachable") from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=503, detail="Failed to fetch user from panel")

    data = resp.json()
    subscription_url = data.get("response", {}).get("subscriptionUrl")
    if not subscription_url:
        raise HTTPException(status_code=503, detail="subscriptionUrl not found in panel response")

    return ConnectionResponse(link=subscription_url)


@router.patch("/auto-renew", response_model=AutoRenewResponse)
async def toggle_auto_renew(
    body: AutoRenewRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AutoRenewResponse:
    if not get_account_user_ids(account):
        raise HTTPException(status_code=404, detail="No subscription found")

    from core.dal.subscription_dal import set_auto_renew

    if body.enabled and not settings.yookassa_autopayments_active:
        raise HTTPException(status_code=403, detail="Auto-renew is disabled")

    sub = await _get_account_active_subscription(db, account, settings)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    updated = await set_auto_renew(db, sub.subscription_id, body.enabled)
    return AutoRenewResponse(auto_renew_enabled=updated.auto_renew_enabled)
