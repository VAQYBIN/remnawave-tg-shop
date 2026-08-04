from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from web.schemas.types import UTCDatetime


class AdminUserListItem(BaseModel):
    user_id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    is_banned: bool
    registration_date: Optional[UTCDatetime]
    panel_user_id: Optional[int]
    email: Optional[str]
    has_active_subscription: bool
    subscription_end_date: Optional[UTCDatetime]

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    items: List[AdminUserListItem]
    total: int
    page: int
    page_size: int


class AdminPaymentItem(BaseModel):
    payment_id: int
    amount: float
    currency: str
    status: str
    provider: Optional[str]
    created_at: Optional[UTCDatetime]
    subscription_duration_months: Optional[int]

    model_config = {"from_attributes": True}


class AdminSubscriptionDetail(BaseModel):
    subscription_id: int
    is_active: bool
    start_date: Optional[UTCDatetime]
    end_date: Optional[UTCDatetime]
    duration_months: Optional[int]
    provider: Optional[str]
    auto_renew_enabled: bool
    traffic_limit_bytes: Optional[int]
    traffic_used_bytes: Optional[int]
    panel_user_id: Optional[int]

    model_config = {"from_attributes": True}


class AdminUserDetailResponse(BaseModel):
    user_id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    is_banned: bool
    registration_date: Optional[UTCDatetime]
    panel_user_id: Optional[int]
    language_code: Optional[str]
    referral_code: Optional[str]
    email: Optional[str]
    subscription: Optional[AdminSubscriptionDetail]
    recent_payments: List[AdminPaymentItem]
    total_paid: float
    panel_data: Optional[Dict[str, Any]]


class AdminActivityItem(BaseModel):
    id: str
    type: str  # signup | payment | admin_ban | admin_unban | admin_add_days | admin_add_traffic | admin_reset_trial
    timestamp: Optional[UTCDatetime]
    amount: Optional[float] = None
    currency: Optional[str] = None
    provider: Optional[str] = None
    duration_months: Optional[int] = None
    days: Optional[int] = None
    gigabytes: Optional[float] = None
    status: Optional[str] = None


class AdminActivityResponse(BaseModel):
    items: List[AdminActivityItem]


class BanRequest(BaseModel):
    reason: Optional[str] = None


class AddDaysRequest(BaseModel):
    days: int


class AddTrafficRequest(BaseModel):
    gigabytes: float
