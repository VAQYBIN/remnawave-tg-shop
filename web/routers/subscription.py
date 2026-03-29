from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
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


@router.get("", response_model=SubscriptionResponse)
async def get_subscription(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubscriptionResponse:
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No subscription found")

    from core.dal.subscription_dal import get_active_subscription_by_user_id
    sub = await get_active_subscription_by_user_id(db, account.telegram_user_id)
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
    settings: Settings = Depends(get_settings),
) -> SubscriptionPlansResponse:
    if settings.traffic_sale_mode:
        plans = [
            TrafficPlan(gb=gb, price_rub=price)
            for gb, price in sorted(settings.traffic_packages.items())
        ]
        return SubscriptionPlansResponse(mode="traffic", plans=plans)

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
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No subscription found")

    from core.dal.subscription_dal import get_active_subscription_by_user_id
    sub = await get_active_subscription_by_user_id(db, account.telegram_user_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    if not settings.PANEL_API_URL:
        raise HTTPException(status_code=503, detail="Panel URL not configured")

    import httpx
    url = f"{settings.PANEL_API_URL.rstrip('/')}/users/{sub.panel_user_uuid}"
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.PANEL_API_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
    except Exception as exc:
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
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No subscription found")

    from core.dal.subscription_dal import get_active_subscription_by_user_id, set_auto_renew
    sub = await get_active_subscription_by_user_id(db, account.telegram_user_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    updated = await set_auto_renew(db, sub.subscription_id, body.enabled)
    return AutoRenewResponse(auto_renew_enabled=updated.auto_renew_enabled)
