from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.models import SiteSettings
from core.services.branding_theme import default_theme


async def get_site_settings(db: AsyncSession) -> SiteSettings:
    result = await db.execute(select(SiteSettings).where(SiteSettings.id == 1))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = SiteSettings(
            id=1,
            brand_name="VPN",
            primary_color="#2AACDF",
            secondary_color="#897569",
            background_color="#F5F1ED",
            foreground_color="#2B2B2B",
            card_color="#FFFFFF",
            border_color="#DDD8D3",
            font_family="Nunito",
            theme_json=default_theme(),
            default_color_scheme="light",
            news_enabled=True,
            referral_enabled=True,
            devices_enabled=True,
        )
        db.add(settings)
        await db.flush()
    elif not settings.theme_json:
        # Legacy row created before theme support — backfill on read.
        from core.services.branding_theme import theme_from_legacy_columns
        settings.theme_json = theme_from_legacy_columns(settings)
        await db.flush()
    return settings


async def update_site_settings(db: AsyncSession, **kwargs) -> SiteSettings:
    settings = await get_site_settings(db)
    for key, value in kwargs.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    await db.flush()
    await db.refresh(settings)
    return settings
