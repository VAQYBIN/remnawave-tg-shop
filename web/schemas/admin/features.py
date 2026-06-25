from pydantic import BaseModel
from typing import Optional


class FeaturesResponse(BaseModel):
    news_enabled: bool
    referral_enabled: bool
    devices_enabled: bool
    support_enabled: bool

    model_config = {"from_attributes": True}


class FeaturesUpdateRequest(BaseModel):
    news_enabled: Optional[bool] = None
    referral_enabled: Optional[bool] = None
    devices_enabled: Optional[bool] = None
    support_enabled: Optional[bool] = None
