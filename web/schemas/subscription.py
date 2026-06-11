from typing import Optional, Literal
from datetime import datetime
from pydantic import BaseModel
from web.schemas.types import UTCDatetime


class SubscriptionResponse(BaseModel):
    subscription_id: int
    is_active: bool
    start_date: Optional[UTCDatetime]
    end_date: UTCDatetime
    duration_months: Optional[int]
    status_from_panel: Optional[str]
    traffic_limit_bytes: Optional[int]
    traffic_used_bytes: Optional[int]
    auto_renew_enabled: bool
    auto_renew_available: bool = False
    provider: Optional[str]
    panel_user_uuid: str
    panel_subscription_uuid: Optional[str]


# ── Legacy plan shapes (kept for backward compat) ──────────────────────────

class TimePlan(BaseModel):
    kind: Literal["time"] = "time"
    months: int
    price_rub: float
    price_stars: Optional[int] = None


class TrafficPlan(BaseModel):
    kind: Literal["traffic"] = "traffic"
    gb: float
    price_rub: float


# ── Public catalog plan shapes (Phase 4+) ─────────────────────────────────

class PubPlanOptionResponse(BaseModel):
    id: int
    duration_months: Optional[int]
    duration_days: Optional[int]
    traffic_gb: Optional[float]
    traffic_unlimited: bool
    price_rub: Optional[float]
    price_stars: Optional[int]
    sort_order: int


class PubPlanResponse(BaseModel):
    id: int
    slug: str
    name_ru: str
    name_en: Optional[str]
    description_ru: Optional[str]
    description_en: Optional[str]
    plan_kind: str
    billing_model: str
    traffic_reset_strategy: str
    min_price_rub: Optional[float]
    min_price_stars: Optional[int]
    is_trial: bool
    options: list[PubPlanOptionResponse]


class SubscriptionPlansResponse(BaseModel):
    mode: Literal["time", "traffic", "catalog"] = "time"
    plans: list[TimePlan | TrafficPlan] = []
    catalog_plans: list[PubPlanResponse] = []


# ── Entitlements ───────────────────────────────────────────────────────────

class EntitlementResponse(BaseModel):
    id: int
    plan_id: int
    plan_option_id: Optional[int]
    plan_slug: str
    plan_name_ru: str
    plan_name_en: Optional[str]
    plan_kind: str
    billing_model: str
    starts_at: UTCDatetime
    ends_at: Optional[UTCDatetime]
    traffic_limit_bytes_added: int
    is_active: bool
    auto_renew_enabled: bool


class EntitlementsResponse(BaseModel):
    standalone: Optional[EntitlementResponse]
    addons: list[EntitlementResponse]
    auto_renew_available: bool = False


class AutoRenewEntitlementRequest(BaseModel):
    enabled: bool


class RenewalBundleAddonResponse(BaseModel):
    entitlement_id: int
    plan_id: int
    option_id: int
    price_rub: Optional[float]
    price_stars: Optional[int]


class RenewalBundleResponse(BaseModel):
    has_bundle: bool
    total_price_rub: Optional[float] = None
    total_price_stars: Optional[int] = None
    addons: list[RenewalBundleAddonResponse] = []


# ── Addons ─────────────────────────────────────────────────────────────────

class AddonPlanOptionResponse(PubPlanOptionResponse):
    prorated_price_rub: Optional[float]
    prorated_price_stars: Optional[int]


class AddonPlanResponse(BaseModel):
    id: int
    slug: str
    name_ru: str
    name_en: Optional[str]
    description_ru: Optional[str]
    description_en: Optional[str]
    billing_model: str
    traffic_reset_strategy: str
    min_price_rub: Optional[float]
    min_price_stars: Optional[int]
    is_trial: bool
    options: list[AddonPlanOptionResponse]


class AddonsListResponse(BaseModel):
    addons: list[AddonPlanResponse]
    standalone_ends_at: Optional[UTCDatetime]


# ── Misc ──────────────────────────────────────────────────────────────────

class ConnectionResponse(BaseModel):
    link: str


class TrialEligibilityResponse(BaseModel):
    eligible: bool
    trial_days: int
    trial_traffic_gb: Optional[float]
    reason: Optional[Literal["disabled", "already_used", "has_subscription"]] = None


class AutoRenewRequest(BaseModel):
    enabled: bool


class AutoRenewResponse(BaseModel):
    auto_renew_enabled: bool
