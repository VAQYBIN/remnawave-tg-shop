"""Helpers for saving support ticket image attachments to the static volume.

Files are written under ``web/static/support`` which is backed by the
persistent ``remnawave-tg-shop-web-static`` Docker volume and served by the
``/static`` mount. URLs are stored as relative ``/static/support/<file>`` and
resolved against the API origin on the frontend (same as branding logos).
"""
import os
import uuid

from fastapi import HTTPException, UploadFile

from core.services.support_core import ALLOWED_IMAGE_CONTENT_TYPES

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
_SUPPORT_DIR = os.path.join(_STATIC_DIR, "support")

_EXT_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


async def save_support_image(file: UploadFile, max_size_mb: int) -> tuple[str, str, str, int]:
    """Validate and persist an uploaded image.

    Returns ``(file_path, url, content_type, file_size)``.
    Raises HTTPException(400) on validation failure.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Допускаются только изображения (JPEG, PNG, GIF, WEBP)")

    content = await file.read()
    max_bytes = max_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Файл слишком большой (макс. {max_size_mb} МБ)")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    os.makedirs(_SUPPORT_DIR, exist_ok=True)

    ext = _EXT_BY_CONTENT_TYPE.get(content_type)
    if not ext:
        ext = os.path.splitext(file.filename or "")[1] or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(_SUPPORT_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    url = f"/static/support/{filename}"
    return filepath, url, content_type, len(content)
