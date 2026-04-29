from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class AdminPaymentListItem(BaseModel):
    payment_id: int
    user_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    amount: float
    original_amount: Optional[float] = None
    discount_applied: Optional[float] = None
    currency: str
    status: str
    provider: Optional[str] = None
    subscription_duration_months: Optional[int] = None
    promo_code: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminPaymentListResponse(BaseModel):
    items: List[AdminPaymentListItem]
    total: int
    page: int
    page_size: int


class DailyRevenuePoint(BaseModel):
    date: str
    amount: float
    count: int


class ProviderRevenueItem(BaseModel):
    provider: str
    amount: float
    count: int


class PaymentStatsResponse(BaseModel):
    today_revenue: float
    week_revenue: float
    month_revenue: float
    all_time_revenue: float
    today_payments_count: int
    by_provider: List[ProviderRevenueItem]
    daily_chart: List[DailyRevenuePoint]
