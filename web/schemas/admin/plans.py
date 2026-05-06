from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from web.schemas.types import UTCDatetime


class PlanResponse(BaseModel):
    id: int
    duration_months: int
    label: Optional[str]
    price_rub: Optional[float]
    price_stars: Optional[int]
    is_enabled: bool
    sort_order: int
    created_at: UTCDatetime
    updated_at: Optional[UTCDatetime]

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
