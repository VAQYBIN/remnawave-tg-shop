"""Public config endpoint — no authentication required."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_settings_dep
from web.schemas.admin.branding import PublicBrandingResponse
from core.dal.site_settings_dal import get_site_settings
from config.settings import Settings

router = APIRouter()


@router.get("/config/branding", response_model=PublicBrandingResponse)
async def get_public_branding(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    """Returns brand settings, feature flags, and legal document URLs. Public, no auth."""
    site = await get_site_settings(db)
    response = PublicBrandingResponse.model_validate(site)
    # Apply .env fallbacks for legal URLs when admin hasn't set them via panel
    if not response.terms_of_service_url and settings.TERMS_OF_SERVICE_URL:
        response.terms_of_service_url = settings.TERMS_OF_SERVICE_URL
    if not response.privacy_policy_url and settings.PRIVACY_POLICY_URL:
        response.privacy_policy_url = settings.PRIVACY_POLICY_URL
    if not response.personal_data_url and settings.PERSONAL_DATA_URL:
        response.personal_data_url = settings.PERSONAL_DATA_URL
    if not response.refund_policy_url and settings.REFUND_POLICY_URL:
        response.refund_policy_url = settings.REFUND_POLICY_URL
    return response
