from pydantic import BaseModel
from typing import Optional


class BrandingResponse(BaseModel):
    brand_name: str
    logo_url: Optional[str]
    favicon_url: Optional[str]
    primary_color: str
    secondary_color: str
    background_color: str
    font_family: str
    custom_css: Optional[str]

    model_config = {"from_attributes": True}


class BrandingUpdateRequest(BaseModel):
    brand_name: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    background_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_css: Optional[str] = None


class PublicBrandingResponse(BrandingResponse):
    news_enabled: bool
    referral_enabled: bool
    devices_enabled: bool
