"""Public config endpoint — no authentication required."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_settings_dep
from web.schemas.admin.branding import PublicBrandingResponse
from web.routers.admin.branding import build_branding_response
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
    response = PublicBrandingResponse(
        **build_branding_response(site).model_dump(),
        news_enabled=site.news_enabled,
        referral_enabled=site.referral_enabled,
        devices_enabled=site.devices_enabled,
        support_enabled=site.support_enabled,
    )
    # Apply .env fallbacks for legal URLs when admin hasn't set them via panel
    if not response.terms_of_service_url and settings.TERMS_OF_SERVICE_URL:
        response.terms_of_service_url = settings.TERMS_OF_SERVICE_URL
    if not response.privacy_policy_url and settings.PRIVACY_POLICY_URL:
        response.privacy_policy_url = settings.PRIVACY_POLICY_URL
    if not response.personal_data_url and settings.PERSONAL_DATA_URL:
        response.personal_data_url = settings.PERSONAL_DATA_URL
    if not response.refund_policy_url and settings.REFUND_POLICY_URL:
        response.refund_policy_url = settings.REFUND_POLICY_URL
    if not response.contact_support_tg_username and settings.CONNTACT_SUPPORT_TG_USERNAME:
        response.contact_support_tg_username = settings.CONNTACT_SUPPORT_TG_USERNAME
    if not response.contact_support_email and settings.CONNTACT_SUPPORT_EMAIL:
        response.contact_support_email = settings.CONNTACT_SUPPORT_EMAIL
    if not response.contact_support_phone and settings.CONNTACT_SUPPORT_PHONE:
        response.contact_support_phone = settings.CONNTACT_SUPPORT_PHONE
    return response
