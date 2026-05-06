from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_current_admin
from web.schemas.admin.features import FeaturesResponse, FeaturesUpdateRequest
from core.dal.site_settings_dal import get_site_settings, update_site_settings
from db.models import Account
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log

router = APIRouter()


@router.get("/features", response_model=FeaturesResponse)
async def get_features(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    return FeaturesResponse.model_validate(settings)


@router.patch("/features", response_model=FeaturesResponse, dependencies=[Depends(admin_action_limit)])
async def patch_features(
    body: FeaturesUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    settings = await update_site_settings(db, **updates)
    await add_admin_audit_log(db, admin, "admin_features_update", details={"updates": updates})
    await db.commit()
    return FeaturesResponse.model_validate(settings)
