from __future__ import annotations

import re
from typing import Optional
from pydantic import BaseModel, model_validator

from web.schemas.types import UTCDatetime

PLAN_KINDS = frozenset({"standalone", "addon"})
BILLING_MODELS = frozenset({"time", "traffic", "hybrid"})
TRAFFIC_RESET_STRATEGIES = frozenset({"NO_RESET", "DAY", "WEEK", "MONTH", "MONTH_ROLLING"})


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:90] or "plan"


def _validate_plan_combination(
    plan_kind: Optional[str],
    billing_model: Optional[str],
    is_trial: Optional[bool],
    traffic_reset_strategy: Optional[str],
) -> None:
    if plan_kind is not None and plan_kind not in PLAN_KINDS:
        raise ValueError(f"plan_kind должен быть одним из: {sorted(PLAN_KINDS)}")
    if billing_model is not None and billing_model not in BILLING_MODELS:
        raise ValueError(f"billing_model должен быть одним из: {sorted(BILLING_MODELS)}")
    if traffic_reset_strategy is not None and traffic_reset_strategy not in TRAFFIC_RESET_STRATEGIES:
        raise ValueError(f"traffic_reset_strategy должен быть одним из: {sorted(TRAFFIC_RESET_STRATEGIES)}")
    if billing_model == "time" and traffic_reset_strategy and traffic_reset_strategy != "NO_RESET":
        raise ValueError("Для billing_model=time допускается только traffic_reset_strategy=NO_RESET")
    if is_trial and plan_kind and plan_kind != "standalone":
        raise ValueError("Пробный тариф (is_trial=true) должен иметь plan_kind=standalone")


# ── Option schemas ─────────────────────────────────────────────────────────

class PricingPlanOptionResponse(BaseModel):
    id: int
    plan_id: int
    duration_months: Optional[int] = None
    duration_days: Optional[int] = None
    traffic_gb: Optional[float] = None
    traffic_unlimited: bool
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: bool
    sort_order: int
    created_at: UTCDatetime
    updated_at: Optional[UTCDatetime] = None

    model_config = {"from_attributes": True}


class PricingPlanOptionCreateRequest(BaseModel):
    duration_months: Optional[int] = None
    duration_days: Optional[int] = None
    traffic_gb: Optional[float] = None
    traffic_unlimited: bool = False
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: bool = False
    sort_order: int = 0

    @model_validator(mode="after")
    def validate_duration_exclusive(self) -> "PricingPlanOptionCreateRequest":
        if self.duration_months is not None and self.duration_days is not None:
            raise ValueError("Нельзя задавать duration_days и duration_months одновременно")
        return self


class PricingPlanOptionUpdateRequest(BaseModel):
    duration_months: Optional[int] = None
    duration_days: Optional[int] = None
    traffic_gb: Optional[float] = None
    traffic_unlimited: Optional[bool] = None
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None

    @model_validator(mode="after")
    def validate_duration_exclusive(self) -> "PricingPlanOptionUpdateRequest":
        if self.duration_months is not None and self.duration_days is not None:
            raise ValueError("Нельзя задавать duration_days и duration_months одновременно")
        return self


# ── Plan schemas ───────────────────────────────────────────────────────────

class PricingPlanResponse(BaseModel):
    id: int
    slug: str
    name_ru: str
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    remnawave_squad_uuid: Optional[str] = None
    remnawave_squad_name_snapshot: Optional[str] = None
    plan_kind: str
    billing_model: str
    traffic_reset_strategy: str
    min_price_rub: Optional[float] = None
    min_price_stars: Optional[int] = None
    is_trial: bool
    is_enabled: bool
    sort_order: int
    created_at: UTCDatetime
    updated_at: Optional[UTCDatetime] = None
    options: list[PricingPlanOptionResponse] = []

    model_config = {"from_attributes": True}


class PricingPlanListResponse(BaseModel):
    items: list[PricingPlanResponse]
    total: int


class PricingPlanCreateRequest(BaseModel):
    slug: Optional[str] = None
    name_ru: str
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    remnawave_squad_uuid: Optional[str] = None
    plan_kind: str = "standalone"
    billing_model: str = "time"
    traffic_reset_strategy: str = "NO_RESET"
    min_price_rub: Optional[float] = None
    min_price_stars: Optional[int] = None
    is_trial: bool = False
    is_enabled: bool = False
    sort_order: int = 0

    @model_validator(mode="after")
    def validate_combination(self) -> "PricingPlanCreateRequest":
        _validate_plan_combination(self.plan_kind, self.billing_model, self.is_trial, self.traffic_reset_strategy)
        return self


class PricingPlanUpdateRequest(BaseModel):
    name_ru: Optional[str] = None
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    remnawave_squad_uuid: Optional[str] = None
    plan_kind: Optional[str] = None
    billing_model: Optional[str] = None
    traffic_reset_strategy: Optional[str] = None
    min_price_rub: Optional[float] = None
    min_price_stars: Optional[int] = None
    is_trial: Optional[bool] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None

    @model_validator(mode="after")
    def validate_combination(self) -> "PricingPlanUpdateRequest":
        _validate_plan_combination(self.plan_kind, self.billing_model, self.is_trial, self.traffic_reset_strategy)
        return self


# ── Legacy schemas (backward compatibility until Phase 9) ──────────────────

class PlanResponse(BaseModel):
    id: int
    duration_months: int
    label: Optional[str] = None
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: bool
    sort_order: int
    created_at: UTCDatetime
    updated_at: Optional[UTCDatetime] = None

    model_config = {"from_attributes": True}


class PlanCreateRequest(BaseModel):
    duration_months: int
    label: Optional[str] = None
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: bool = False
    sort_order: int = 0


class PlanUpdateRequest(BaseModel):
    duration_months: Optional[int] = None
    label: Optional[str] = None
    price_rub: Optional[float] = None
    price_stars: Optional[int] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class PlansListResponse(BaseModel):
    items: list[PlanResponse]
    total: int
