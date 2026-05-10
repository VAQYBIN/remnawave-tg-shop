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
    ConnectionResponse,
    TimePlan,
    TrialEligibilityResponse,
    TrafficPlan,
    SubscriptionPlansResponse,
    SubscriptionResponse,
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
        provider=result.get("provider"),
        panel_user_uuid=result["panel_user_uuid"],
        panel_subscription_uuid=result.get("panel_subscription_uuid"),
    )


@router.get("/plans", response_model=SubscriptionPlansResponse)
async def get_plans(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubscriptionPlansResponse:
    if settings.traffic_sale_mode:
        plans = [
            TrafficPlan(gb=gb, price_rub=price)
            for gb, price in sorted(settings.traffic_packages.items())
        ]
        return SubscriptionPlansResponse(mode="traffic", plans=plans)

    # Try DB first — use plans configured in admin panel
    from core.dal.pricing_plan_dal import get_enabled_plans
    db_plans = await get_enabled_plans(db)
    if db_plans:
        plans = [
            TimePlan(months=p.duration_months, price_rub=p.price_rub or 0.0, price_stars=p.price_stars)
            for p in db_plans
            if p.price_rub is not None
        ]
        if plans:
            return SubscriptionPlansResponse(mode="time", plans=plans)

    # Fallback to env vars (legacy / not yet configured in admin)
    plans = [
        TimePlan(months=months, price_rub=price)
        for months, price in sorted(settings.subscription_options.items())
    ]
    return SubscriptionPlansResponse(mode="time", plans=plans)


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
    sub = await _get_account_active_subscription(db, account, settings)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    updated = await set_auto_renew(db, sub.subscription_id, body.enabled)
    return AutoRenewResponse(auto_renew_enabled=updated.auto_renew_enabled)
