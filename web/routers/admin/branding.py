import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from web.dependencies import get_db, get_current_admin, get_settings_dep
from web.schemas.admin.branding import BrandingResponse, BrandingUpdateRequest
from core.dal.site_settings_dal import get_site_settings, update_site_settings
from config.settings import Settings
from db.models import Account

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


@router.patch("/branding", response_model=BrandingResponse)
async def patch_branding(
    body: BrandingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    settings = await update_site_settings(db, **updates)
    return BrandingResponse.model_validate(settings)


@router.post("/branding/logo", response_model=BrandingResponse)
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
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
    return BrandingResponse.model_validate(site_settings)
