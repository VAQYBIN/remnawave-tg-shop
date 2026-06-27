from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from config.settings import Settings, get_settings
from web.dependencies import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/config")
async def get_config(
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
):
    from core.services.payment_core import get_available_providers_db

    return {
        "available_providers": await get_available_providers_db(db, settings),
    }
