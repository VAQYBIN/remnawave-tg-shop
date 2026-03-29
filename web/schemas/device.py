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
