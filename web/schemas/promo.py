from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ApplyPromoRequest(BaseModel):
    code: str


class PromoApplyResponse(BaseModel):
    promo_code: str
    discount_percentage: int
    expires_at: datetime


class ActiveDiscountResponse(BaseModel):
    promo_code: str
    discount_percentage: int
    expires_at: datetime
