"""Public config endpoint — no authentication required."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db
from web.schemas.admin.branding import PublicBrandingResponse
from core.dal.site_settings_dal import get_site_settings

router = APIRouter()


@router.get("/config/branding", response_model=PublicBrandingResponse)
async def get_public_branding(db: AsyncSession = Depends(get_db)):
    """Returns brand settings and feature flags. Public, no auth."""
    settings = await get_site_settings(db)
    return PublicBrandingResponse.model_validate(settings)
