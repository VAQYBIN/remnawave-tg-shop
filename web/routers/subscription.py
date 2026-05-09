import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from core.dal.account_dal import get_account_user_ids
from web.schemas.subscription import (
    AutoRenewRequest,
    AutoRenewResponse,
    ConnectionResponse,
    TimePlan,
    TrafficPlan,
    SubscriptionPlansResponse,
    SubscriptionResponse,
)

router = APIRouter(prefix="/subscription", tags=["subscription"])


async def _get_account_active_subscription(db: AsyncSession, account: Account):
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
    return None


@router.get("", response_model=SubscriptionResponse)
async def get_subscription(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubscriptionResponse:
    if not get_account_user_ids(account):
        raise HTTPException(status_code=404, detail="No subscription found")

    sub = await _get_account_active_subscription(db, account)
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

    sub = await _get_account_active_subscription(db, account)
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
) -> AutoRenewResponse:
    if not get_account_user_ids(account):
        raise HTTPException(status_code=404, detail="No subscription found")

    from core.dal.subscription_dal import set_auto_renew
    sub = await _get_account_active_subscription(db, account)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    updated = await set_auto_renew(db, sub.subscription_id, body.enabled)
    return AutoRenewResponse(auto_renew_enabled=updated.auto_renew_enabled)
