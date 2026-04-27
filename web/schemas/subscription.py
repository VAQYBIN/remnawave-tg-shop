from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel


class SubscriptionResponse(BaseModel):
    subscription_id: int
    is_active: bool
    start_date: Optional[datetime]
    end_date: datetime
    duration_months: Optional[int]
    status_from_panel: Optional[str]
    traffic_limit_bytes: Optional[int]
    traffic_used_bytes: Optional[int]
    auto_renew_enabled: bool
    provider: Optional[str]
    panel_user_uuid: str
    panel_subscription_uuid: Optional[str]


class TimePlan(BaseModel):
    kind: Literal["time"] = "time"
    months: int
    price_rub: float
    price_stars: Optional[int] = None


class TrafficPlan(BaseModel):
    kind: Literal["traffic"] = "traffic"
    gb: float
    price_rub: float


class SubscriptionPlansResponse(BaseModel):
    mode: Literal["time", "traffic"]
    plans: list[TimePlan | TrafficPlan]


class ConnectionResponse(BaseModel):
    link: str


class AutoRenewRequest(BaseModel):
    enabled: bool


class AutoRenewResponse(BaseModel):
    auto_renew_enabled: bool
