from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_db, get_current_admin
from web.schemas.admin.payment_providers import (
    PaymentProviderResponse,
    PaymentProviderUpdateRequest,
    PaymentProvidersListResponse,
)
from core.dal.payment_provider_config_dal import get_all_providers, update_provider

router = APIRouter()


@router.get("/payment-providers", response_model=PaymentProvidersListResponse)
async def list_payment_providers(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    providers = await get_all_providers(db)
    return PaymentProvidersListResponse(
        items=[PaymentProviderResponse.model_validate(p) for p in providers]
    )


@router.patch("/payment-providers/{provider_id}", response_model=PaymentProviderResponse)
async def update_payment_provider(
    provider_id: int,
    body: PaymentProviderUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    provider = await update_provider(db, provider_id, **updates)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()
    return PaymentProviderResponse.model_validate(provider)
