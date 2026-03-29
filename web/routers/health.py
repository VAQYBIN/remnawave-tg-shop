from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from config.settings import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/config")
async def get_config(settings: Settings = Depends(get_settings)):
    from core.services.payment_core import get_available_providers
    return {
        "available_providers": get_available_providers(settings),
    }
