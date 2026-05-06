from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.models import PaymentProviderConfig


async def get_all_providers(db: AsyncSession) -> List[PaymentProviderConfig]:
    result = await db.execute(
        select(PaymentProviderConfig).order_by(PaymentProviderConfig.sort_order, PaymentProviderConfig.id)
    )
    return list(result.scalars().all())


async def get_enabled_providers(db: AsyncSession) -> List[PaymentProviderConfig]:
    result = await db.execute(
        select(PaymentProviderConfig)
        .where(PaymentProviderConfig.is_enabled == True)
        .order_by(PaymentProviderConfig.sort_order, PaymentProviderConfig.id)
    )
    return list(result.scalars().all())


async def get_provider_by_id(db: AsyncSession, provider_id: int) -> Optional[PaymentProviderConfig]:
    result = await db.execute(select(PaymentProviderConfig).where(PaymentProviderConfig.id == provider_id))
    return result.scalar_one_or_none()


async def get_provider_by_key(db: AsyncSession, provider_key: str) -> Optional[PaymentProviderConfig]:
    result = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.provider_key == provider_key)
    )
    return result.scalar_one_or_none()


async def update_provider(db: AsyncSession, provider_id: int, **kwargs) -> Optional[PaymentProviderConfig]:
    provider = await get_provider_by_id(db, provider_id)
    if provider is None:
        return None
    for key, value in kwargs.items():
        if hasattr(provider, key):
            setattr(provider, key, value)
    await db.flush()
    await db.refresh(provider)
    return provider
