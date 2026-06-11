from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.device import DevicesResponse, map_panel_device
from core.services.panel_client import PanelApiService
from core.dal.subscription_dal import get_active_subscription_by_user_id

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=DevicesResponse)
async def get_devices(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DevicesResponse:
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No Telegram account linked")

    sub = await get_active_subscription_by_user_id(db, account.telegram_user_id)
    if not sub or not sub.panel_user_uuid:
        return DevicesResponse(devices=[], total=0)

    panel = PanelApiService(settings)
    try:
        raw_devices = await panel.get_user_devices(sub.panel_user_uuid)
    finally:
        await panel.close()

    if raw_devices is None:
        raise HTTPException(status_code=502, detail="Failed to fetch devices from panel")

    devices = [map_panel_device(d) for d in raw_devices]
    return DevicesResponse(devices=devices, total=len(devices))


@router.delete("/{hwid}", status_code=204)
async def disconnect_device(
    hwid: str,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No Telegram account linked")

    sub = await get_active_subscription_by_user_id(db, account.telegram_user_id)
    if not sub or not sub.panel_user_uuid:
        raise HTTPException(status_code=404, detail="No active subscription")

    panel = PanelApiService(settings)
    try:
        success = await panel.disconnect_device(sub.panel_user_uuid, hwid)
    finally:
        await panel.close()

    if not success:
        raise HTTPException(status_code=502, detail="Failed to disconnect device")
