from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_current_admin
from web.schemas.admin.features import FeaturesResponse, FeaturesUpdateRequest
from core.dal.site_settings_dal import get_site_settings, update_site_settings
from db.models import Account

router = APIRouter()


@router.get("/features", response_model=FeaturesResponse)
async def get_features(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    return FeaturesResponse.model_validate(settings)


@router.patch("/features", response_model=FeaturesResponse)
async def patch_features(
    body: FeaturesUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    settings = await update_site_settings(db, **updates)
    return FeaturesResponse.model_validate(settings)
