from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, model_validator
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
    months: Optional[int] = Field(default=None, ge=1, le=120)
    plan_option_id: Optional[int] = Field(default=None, ge=1)
    addon_option_id: Optional[int] = Field(default=None, ge=1)
    promo_code: Optional[str] = None

    @model_validator(mode="after")
    def check_months_or_option(self) -> "CreatePaymentRequest":
        if self.months is None and self.plan_option_id is None:
            raise ValueError("Укажите months или plan_option_id")
        if self.addon_option_id is not None and self.plan_option_id is None:
            raise ValueError("Дополнение можно добавить только к каталожному тарифу")
        return self


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
