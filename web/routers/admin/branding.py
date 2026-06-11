import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_current_admin, get_settings_dep
from web.schemas.admin.branding import BrandingResponse, BrandingUpdateRequest
from core.dal.site_settings_dal import get_site_settings, update_site_settings
from config.settings import Settings
from db.models import Account
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log

router = APIRouter()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static")
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


@router.get("/branding", response_model=BrandingResponse)
async def get_branding(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    settings = await get_site_settings(db)
    return BrandingResponse.model_validate(settings)


@router.patch("/branding", response_model=BrandingResponse, dependencies=[Depends(admin_action_limit)])
async def patch_branding(
    body: BrandingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    settings = await update_site_settings(db, **updates)
    await add_admin_audit_log(db, admin, "admin_branding_update", details={"fields": sorted(updates.keys())})
    await db.commit()
    return BrandingResponse.model_validate(settings)


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
    return BrandingResponse.model_validate(site_settings)


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
    return BrandingResponse.model_validate(site_settings)


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
    return BrandingResponse.model_validate(site_settings)


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
    return BrandingResponse.model_validate(site_settings)
