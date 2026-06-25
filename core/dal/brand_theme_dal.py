"""DAL for saved branding presets (brand_themes table)."""
from typing import Any, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import BrandTheme
from core.services.branding_theme import BUILTIN_THEMES, normalise_theme


async def list_brand_themes(db: AsyncSession) -> List[BrandTheme]:
    """Return all presets, built-ins first, then newest saved themes."""
    result = await db.execute(
        select(BrandTheme).order_by(BrandTheme.is_builtin.desc(), BrandTheme.id.asc())
    )
    return list(result.scalars().all())


async def get_brand_theme(db: AsyncSession, theme_id: int) -> Optional[BrandTheme]:
    result = await db.execute(select(BrandTheme).where(BrandTheme.id == theme_id))
    return result.scalar_one_or_none()


async def create_brand_theme(
    db: AsyncSession,
    *,
    name: str,
    theme_json: dict,
    font_family: Optional[str] = None,
    heading_font_family: Optional[str] = None,
    is_builtin: bool = False,
) -> BrandTheme:
    theme = BrandTheme(
        name=name,
        theme_json=normalise_theme(theme_json),
        font_family=font_family,
        heading_font_family=heading_font_family,
        is_builtin=is_builtin,
    )
    db.add(theme)
    await db.flush()
    await db.refresh(theme)
    return theme


async def delete_brand_theme(db: AsyncSession, theme: BrandTheme) -> None:
    await db.delete(theme)
    await db.flush()


async def ensure_builtin_themes(db: AsyncSession) -> None:
    """Seed missing built-in presets. Safe to call repeatedly (idempotent)."""
    result = await db.execute(
        select(BrandTheme.name).where(BrandTheme.is_builtin.is_(True))
    )
    existing = {row[0] for row in result.all()}
    created = False
    for preset in BUILTIN_THEMES:
        if preset["name"] in existing:
            continue
        db.add(
            BrandTheme(
                name=preset["name"],
                theme_json=normalise_theme(preset["theme"]),
                font_family=preset.get("font_family"),
                heading_font_family=preset.get("heading_font_family"),
                is_builtin=True,
            )
        )
        created = True
    if created:
        await db.flush()
