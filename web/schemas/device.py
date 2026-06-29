from typing import Optional, List
from pydantic import BaseModel


class Device(BaseModel):
    hwid: str
    name: Optional[str] = None
    platform: Optional[str] = None
    os_version: Optional[str] = None
    model: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DevicesResponse(BaseModel):
    devices: List[Device]
    total: int


def map_panel_device(raw) -> Device:
    """Normalize a raw device entry from the Remnawave panel into a Device."""
    if isinstance(raw, str):
        return Device(hwid=raw)
    return Device(
        hwid=raw.get("hwid", ""),
        name=raw.get("name"),
        platform=raw.get("platform"),
        os_version=raw.get("osVersion") or raw.get("os_version"),
        model=raw.get("deviceModel") or raw.get("model"),
        user_agent=raw.get("userAgent") or raw.get("user_agent"),
        created_at=raw.get("createdAt") or raw.get("created_at"),
        updated_at=raw.get("updatedAt") or raw.get("updated_at"),
    )
