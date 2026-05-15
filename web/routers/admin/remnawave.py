import json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from redis.asyncio import Redis

from config.settings import Settings
from core.services.panel_client import PanelApiService
from db.models import Account
from web.dependencies import get_current_admin, get_redis, get_settings_dep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/remnawave")

_SQUADS_CACHE_KEY = "cache:remnawave:squads"
_SQUADS_CACHE_TTL = 300  # 5 minutes


class InternalSquadItem(BaseModel):
    uuid: str
    name: str


class InternalSquadsResponse(BaseModel):
    items: List[Dict[str, Any]]
    cached: bool


@router.get("/squads", response_model=InternalSquadsResponse)
async def list_internal_squads(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
    redis: Redis = Depends(get_redis),
) -> InternalSquadsResponse:
    """Return Internal Squads from Remnawave, cached in Redis for 5 minutes."""
    raw = await redis.get(_SQUADS_CACHE_KEY)
    if raw:
        logger.debug("Returning Internal Squads from Redis cache.")
        return InternalSquadsResponse(items=json.loads(raw), cached=True)

    panel = PanelApiService(settings)
    squads = await panel.get_internal_squads()
    if squads is None:
        raise HTTPException(
            status_code=502,
            detail="Remnawave API недоступен: не удалось получить список Internal Squads.",
        )

    await redis.set(_SQUADS_CACHE_KEY, json.dumps(squads), ex=_SQUADS_CACHE_TTL)
    logger.debug("Fetched %d Internal Squads from Remnawave and cached.", len(squads))
    return InternalSquadsResponse(items=squads, cached=False)
