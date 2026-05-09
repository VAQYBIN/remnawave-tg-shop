from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
import uuid


class AdminMeResponse(BaseModel):
    account_id: uuid.UUID
    email: str | None
    telegram_user_id: int | None
    is_admin: bool = True


class RecentPaymentItem(BaseModel):
    payment_id: int
    user_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    amount: float
    currency: str
    status: str
    provider: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    # Today
    new_users_today: int
    payments_today: int
    revenue_today: float
    # 7-day
    new_users_7days: int
    revenue_7days: float
    # 30-day
    revenue_30days: float
    # All-time
    total_users: int
    total_subscriptions: int
    active_subscriptions: int
    total_payments: int
    total_revenue: float
    # Expiring
    expiring_soon_count: int
    # Recent
    recent_payments: List[RecentPaymentItem]
