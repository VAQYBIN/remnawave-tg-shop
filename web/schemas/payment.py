from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from web.schemas.types import UTCDatetime


class PaymentResponse(BaseModel):
    payment_id: int
    amount: float
    original_amount: Optional[float]
    discount_applied: Optional[float]
    currency: str
    status: str
    description: Optional[str]
    subscription_duration_months: Optional[int]
    provider: str
    created_at: UTCDatetime


class PaymentsListResponse(BaseModel):
    items: list[PaymentResponse]
    total: int
    page: int
    limit: int


class CreatePaymentRequest(BaseModel):
    provider: str
    months: int = Field(ge=1, le=120)
    promo_code: Optional[str] = None


class CreatePaymentResponse(BaseModel):
    payment_id: int
    redirect_url: str
    amount: float
    original_amount: Optional[float]
    currency: str


class PaymentsCountResponse(BaseModel):
    total: int


class PaymentStatusResponse(BaseModel):
    payment_id: int
    status: str
    provider: str
    amount: float
    original_amount: Optional[float]
    discount_applied: Optional[float]
    currency: str
    description: Optional[str]
    subscription_duration_months: Optional[int]
    redirect_url: Optional[str]
    promo_code: Optional[str]
    created_at: UTCDatetime
