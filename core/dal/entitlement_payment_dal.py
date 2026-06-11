from typing import Optional, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import EntitlementPayment


async def get_link(
    db: AsyncSession,
    *,
    entitlement_id: int,
    payment_id: int,
    purpose: str,
) -> Optional[EntitlementPayment]:
    result = await db.execute(
        select(EntitlementPayment).where(
            EntitlementPayment.entitlement_id == entitlement_id,
            EntitlementPayment.payment_id == payment_id,
            EntitlementPayment.purpose == purpose,
        )
    )
    return result.scalar_one_or_none()


async def create_link(
    db: AsyncSession,
    *,
    entitlement_id: int,
    payment_id: int,
    purpose: str,
) -> EntitlementPayment:
    existing = await get_link(
        db,
        entitlement_id=entitlement_id,
        payment_id=payment_id,
        purpose=purpose,
    )
    if existing:
        return existing
    link = EntitlementPayment(
        entitlement_id=entitlement_id,
        payment_id=payment_id,
        purpose=purpose,
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link


async def get_links_for_payment(
    db: AsyncSession,
    payment_id: int,
) -> List[EntitlementPayment]:
    result = await db.execute(
        select(EntitlementPayment)
        .where(EntitlementPayment.payment_id == payment_id)
        .order_by(EntitlementPayment.id)
    )
    return list(result.scalars().all())
