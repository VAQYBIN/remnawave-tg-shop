from pydantic import BaseModel
import uuid


class AdminMeResponse(BaseModel):
    account_id: uuid.UUID
    email: str | None
    telegram_user_id: int | None
    is_admin: bool = True


class DashboardResponse(BaseModel):
    total_users: int
    total_subscriptions: int
    active_subscriptions: int
    total_payments: int
    total_revenue: float
    new_users_today: int
    payments_today: int
    revenue_today: float
