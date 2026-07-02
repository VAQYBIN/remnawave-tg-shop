from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, field_validator, model_validator

from core.services.branding_theme import (
    COLOR_SCHEMES,
    DEFAULT_COLOR_SCHEME,
    normalise_theme,
)


class Theme(BaseModel):
    """Full design-token theme: light + dark palettes plus radius.

    Input is normalised (gaps filled from defaults, non-hex values rejected per
    token) so the stored/returned structure is always complete and valid.
    """
    light: Dict[str, str]
    dark: Dict[str, str]
    radius: str

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return normalise_theme(data)
        return data


class BrandingResponse(BaseModel):
    brand_name: str
    logo_url: Optional[str]
    favicon_url: Optional[str]
    # Legacy flat colours (kept in sync with theme.light for back-compat)
    primary_color: str
    secondary_color: str
    background_color: str
    foreground_color: str
    card_color: str
    border_color: str
    font_family: str
    heading_font_family: Optional[str] = None
    theme: Theme
    default_color_scheme: str = DEFAULT_COLOR_SCHEME
    custom_css: Optional[str]
    privacy_policy_url: Optional[str] = None
    terms_of_service_url: Optional[str] = None
    personal_data_url: Optional[str] = None
    refund_policy_url: Optional[str] = None
    contact_support_tg_username: Optional[str] = None
    contact_support_email: Optional[str] = None
    contact_support_phone: Optional[str] = None

    model_config = {"from_attributes": True}


class BrandingUpdateRequest(BaseModel):
    brand_name: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    font_family: Optional[str] = None
    heading_font_family: Optional[str] = None
    theme: Optional[Theme] = None
    default_color_scheme: Optional[str] = None
    custom_css: Optional[str] = None
    privacy_policy_url: Optional[str] = None
    terms_of_service_url: Optional[str] = None
    personal_data_url: Optional[str] = None
    refund_policy_url: Optional[str] = None
    contact_support_tg_username: Optional[str] = None
    contact_support_email: Optional[str] = None
    contact_support_phone: Optional[str] = None

    @field_validator("default_color_scheme")
    @classmethod
    def _valid_scheme(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in COLOR_SCHEMES:
            raise ValueError(f"default_color_scheme must be one of {COLOR_SCHEMES}")
        return v


class PublicBrandingResponse(BrandingResponse):
    news_enabled: bool
    referral_enabled: bool
    devices_enabled: bool
    support_enabled: bool


# ── Saved presets ────────────────────────────────────────────────────────────
class BrandThemeResponse(BaseModel):
    id: int
    name: str
    is_builtin: bool
    theme: Theme
    font_family: Optional[str] = None
    heading_font_family: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BrandThemeCreateRequest(BaseModel):
    name: str
    theme: Theme
    font_family: Optional[str] = None
    heading_font_family: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_not_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name must not be empty")
        if len(v) > 100:
            raise ValueError("name too long (max 100)")
        return v
