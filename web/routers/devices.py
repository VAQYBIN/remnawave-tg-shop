import time
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.device import DevicesResponse, map_panel_device
from web.schemas.app_config import load_app_config, is_valid_v2_config
from core.services.panel_client import PanelApiService
from core.dal.subscription_dal import get_active_subscription_by_user_id

router = APIRouter(prefix="/devices", tags=["devices"])

# The panel ships a "Default" Subscription Page config under this fixed UUID.
_DEFAULT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000"

# Cache the (heavy) v2 config in-process so we don't hit the panel on every request.
# Auto-syncs with panel edits within the TTL window.
_APP_CONFIG_CACHE: dict = {"data": None, "ts": 0.0}
_APP_CONFIG_TTL = 300.0  # seconds


async def _fetch_app_config_from_panel(settings: Settings) -> Optional[dict]:
    """Resolve which Subscription Page config to use and fetch its v2 payload."""
    panel = PanelApiService(settings)
    try:
        target = settings.SUBSCRIPTION_PAGE_CONFIG_UUID.strip()
        if not target:
            configs = await panel.get_subscription_page_configs()
            if not configs:
                return None
            chosen = next(
                (c for c in configs if c.get("uuid") == _DEFAULT_CONFIG_UUID), None
            ) or min(configs, key=lambda c: c.get("viewPosition", 0))
            target = chosen.get("uuid")
        if not target:
            return None
        config = await panel.get_subscription_page_config(target)
        return config if is_valid_v2_config(config) else None
    finally:
        await panel.close()


@router.get("/app-config")
async def get_app_config(
    account: Account = Depends(get_current_account),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Serve the Subscription Page app config (apps + connection guides).

    Pulled live from the panel (cached for a few minutes so panel edits propagate
    automatically). ``SUBSCRIPTION_PAGE_CONFIG_PATH`` is an optional offline override.
    Returns ``{"config": <v2 config>}`` or ``{"config": null}`` (frontend falls back
    to its built-in client list).
    """
    # Optional offline override: a mounted file wins over the panel when present.
    if settings.SUBSCRIPTION_PAGE_CONFIG_PATH:
        file_config = load_app_config(settings.SUBSCRIPTION_PAGE_CONFIG_PATH)
        if file_config:
            return {"config": file_config}

    now = time.monotonic()
    cached = _APP_CONFIG_CACHE["data"]
    if cached is not None and now - _APP_CONFIG_CACHE["ts"] < _APP_CONFIG_TTL:
        return {"config": cached}

    try:
        config = await _fetch_app_config_from_panel(settings)
    except Exception as exc:  # never 500 the cabinet over a guide
        logging.warning("Failed to fetch subscription page config from panel: %s", exc)
        config = None

    if config is not None:
        _APP_CONFIG_CACHE["data"] = config
        _APP_CONFIG_CACHE["ts"] = now
        return {"config": config}

    # Panel unavailable: serve stale cache if we have it, else null.
    return {"config": cached}


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
