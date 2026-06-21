import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_current_admin, get_settings_dep
from web.schemas.admin.branding import (
    BrandingResponse,
    BrandingUpdateRequest,
    BrandThemeResponse,
    BrandThemeCreateRequest,
)
from core.dal.site_settings_dal import get_site_settings, update_site_settings
from core.dal.brand_theme_dal import (
    list_brand_themes,
    get_brand_theme,
    create_brand_theme,
    delete_brand_theme,
    ensure_builtin_themes,
)
from core.services.branding_theme import resolve_theme, legacy_columns_from_theme
from config.settings import Settings
from db.models import Account, SiteSettings, BrandTheme
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log

router = APIRouter()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static")
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


def build_branding_response(settings: SiteSettings) -> BrandingResponse:
    """Assemble a BrandingResponse, resolving the effective theme structure."""
    return BrandingResponse(
        brand_name=settings.brand_name,
        logo_url=settings.logo_url,
        favicon_url=settings.favicon_url,
        primary_color=settings.primary_color,
        secondary_color=settings.secondary_color,
        background_color=settings.background_color,
        foreground_color=settings.foreground_color,
        card_color=settings.card_color,
        border_color=settings.border_color,
        font_family=settings.font_family,
        heading_font_family=settings.heading_font_family,
        theme=resolve_theme(settings),
        default_color_scheme=settings.default_color_scheme or "light",
        custom_css=settings.custom_css,
        privacy_policy_url=settings.privacy_policy_url,
        terms_of_service_url=settings.terms_of_service_url,
        personal_data_url=settings.personal_data_url,
        refund_policy_url=settings.refund_policy_url,
    )


def _theme_db_updates(theme_obj) -> dict:
    """Turn a validated Theme into column updates (theme_json + legacy mirror)."""
    theme_dict = theme_obj.model_dump()
    updates = {"theme_json": theme_dict}
    updates.update(legacy_columns_from_theme(theme_dict))
    return updates


@router.get("/branding", response_model=BrandingResponse)
async def get_branding(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    return build_branding_response(settings)


@router.patch("/branding", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def patch_branding(
    body: BrandingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    theme_obj = body.theme
    updates.pop("theme", None)
    if theme_obj is not None:
        updates.update(_theme_db_updates(theme_obj))
    settings = await update_site_settings(db, **updates)
    await add_admin_audit_log(db, admin, "admin_branding_update", details={"fields": sorted(updates.keys())})
    await db.commit()
    return build_branding_response(settings)


# ── Saved presets ────────────────────────────────────────────────────────────
def _brand_theme_response(theme: BrandTheme) -> BrandThemeResponse:
    return BrandThemeResponse(
        id=theme.id,
        name=theme.name,
        is_builtin=theme.is_builtin,
        theme=theme.theme_json,
        font_family=theme.font_family,
        heading_font_family=theme.heading_font_family,
        created_at=theme.created_at,
    )


@router.get("/branding/themes", response_model=list[BrandThemeResponse])
async def list_themes(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    await ensure_builtin_themes(db)
    await db.commit()
    themes = await list_brand_themes(db)
    return [_brand_theme_response(t) for t in themes]


@router.post("/branding/themes", response_model=BrandThemeResponse, dependencies=[Depends(admin_action_limit)])
async def save_theme(
    body: BrandThemeCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    theme = await create_brand_theme(
        db,
        name=body.name,
        theme_json=body.theme.model_dump(),
        font_family=body.font_family,
        heading_font_family=body.heading_font_family,
        is_builtin=False,
    )
    await add_admin_audit_log(db, admin, "admin_branding_theme_create", details={"name": body.name})
    await db.commit()
    return _brand_theme_response(theme)


@router.delete("/branding/themes/{theme_id}", dependencies=[Depends(admin_action_limit)])
async def remove_theme(
    theme_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    theme = await get_brand_theme(db, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    if theme.is_builtin:
        raise HTTPException(status_code=400, detail="Встроенную тему нельзя удалить")
    await delete_brand_theme(db, theme)
    await add_admin_audit_log(db, admin, "admin_branding_theme_delete", details={"id": theme_id})
    await db.commit()
    return {"ok": True}


@router.post("/branding/themes/{theme_id}/apply", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def apply_theme(
    theme_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    theme = await get_brand_theme(db, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    updates = {"theme_json": theme.theme_json}
    updates.update(legacy_columns_from_theme(theme.theme_json))
    if theme.font_family:
        updates["font_family"] = theme.font_family
    updates["heading_font_family"] = theme.heading_font_family
    settings = await update_site_settings(db, **updates)
    await add_admin_audit_log(db, admin, "admin_branding_theme_apply", details={"id": theme_id, "name": theme.name})
    await db.commit()
    return build_branding_response(settings)


def _delete_static_file(url: str | None) -> None:
    """Best-effort removal of a previously uploaded static asset."""
    if not url:
        return
    filename = os.path.basename(url)
    if not filename:
        return
    filepath = os.path.join(STATIC_DIR, filename)
    try:
        os.remove(filepath)
    except OSError:
        pass


@router.post("/branding/favicon", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def upload_favicon(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")

    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 2 МБ)")

    os.makedirs(STATIC_DIR, exist_ok=True)

    ext = os.path.splitext(file.filename or "favicon.ico")[1] or ".ico"
    filename = f"favicon_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(STATIC_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    api_base = settings.WEB_API_URL.rstrip("/")
    favicon_url = f"{api_base}/static/{filename}"
    site_settings = await update_site_settings(db, favicon_url=favicon_url)
    await add_admin_audit_log(
        db,
        admin,
        "admin_branding_favicon_upload",
        details={"filename": filename, "content_type": file.content_type, "size": len(content)},
    )
    await db.commit()
    return build_branding_response(site_settings)


@router.post("/branding/logo", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")

    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 2 МБ)")

    os.makedirs(STATIC_DIR, exist_ok=True)

    ext = os.path.splitext(file.filename or "logo.png")[1] or ".png"
    filename = f"logo_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(STATIC_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    # Store absolute URL so the frontend can load it directly from the API
    api_base = settings.WEB_API_URL.rstrip("/")
    logo_url = f"{api_base}/static/{filename}"
    site_settings = await update_site_settings(db, logo_url=logo_url)
    await add_admin_audit_log(
        db,
        admin,
        "admin_branding_logo_upload",
        details={"filename": filename, "content_type": file.content_type, "size": len(content)},
    )
    await db.commit()
    return build_branding_response(site_settings)


@router.delete("/branding/logo", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def delete_logo(
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    _delete_static_file(settings.logo_url)
    site_settings = await update_site_settings(db, logo_url=None)
    await add_admin_audit_log(db, admin, "admin_branding_logo_delete")
    await db.commit()
    return build_branding_response(site_settings)


@router.delete("/branding/favicon", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def delete_favicon(
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    _delete_static_file(settings.favicon_url)
    site_settings = await update_site_settings(db, favicon_url=None)
    await add_admin_audit_log(db, admin, "admin_branding_favicon_delete")
    await db.commit()
    return build_branding_response(site_settings)
