from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PaymentProviderResponse(BaseModel):
    id: int
    provider_key: str
    display_name: str
    is_enabled: bool
    sort_order: int
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PaymentProviderUpdateRequest(BaseModel):
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None
    display_name: Optional[str] = None


class PaymentProvidersListResponse(BaseModel):
    items: list[PaymentProviderResponse]
