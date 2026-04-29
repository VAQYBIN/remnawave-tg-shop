from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


class AdminPromoItem(BaseModel):
    promo_code_id: int
    code: str
    promo_type: str
    bonus_days: Optional[int] = None
    discount_percentage: Optional[int] = None
    max_activations: int
    current_activations: int
    is_active: bool
    created_at: Optional[datetime] = None
    valid_until: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminPromoListResponse(BaseModel):
    items: List[AdminPromoItem]
    total: int
    page: int
    page_size: int


class PromoCreateRequest(BaseModel):
    code: str
    promo_type: str
    bonus_days: Optional[int] = None
    discount_percentage: Optional[int] = None
    max_activations: int
    valid_until: Optional[datetime] = None

    @field_validator("promo_type")
    @classmethod
    def validate_promo_type(cls, v: str) -> str:
        if v not in ("bonus_days", "discount"):
            raise ValueError("promo_type must be 'bonus_days' or 'discount'")
        return v

    @field_validator("discount_percentage")
    @classmethod
    def validate_discount(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 100):
            raise ValueError("discount_percentage must be between 1 and 100")
        return v


class PromoUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    max_activations: Optional[int] = None
    valid_until: Optional[datetime] = None
    bonus_days: Optional[int] = None
    discount_percentage: Optional[int] = None
