from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from web.schemas.types import UTCDatetime


class ApplyPromoRequest(BaseModel):
    code: str


class PromoApplyResponse(BaseModel):
    promo_code: str
    discount_percentage: int
    expires_at: UTCDatetime


class ActiveDiscountResponse(BaseModel):
    promo_code: str
    discount_percentage: int
    expires_at: UTCDatetime
