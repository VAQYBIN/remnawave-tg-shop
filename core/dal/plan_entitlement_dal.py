from datetime import datetime
from typing import Optional, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import PricingPlan, UserPlanEntitlement


async def get_entitlement_by_id(
    db: AsyncSession,
    entitlement_id: int,
) -> Optional[UserPlanEntitlement]:
    result = await db.execute(
        select(UserPlanEntitlement)
        .where(UserPlanEntitlement.id == entitlement_id)
        .options(
            selectinload(UserPlanEntitlement.plan),
            selectinload(UserPlanEntitlement.plan_option),
        )
    )
    return result.scalar_one_or_none()


async def get_active_entitlements_for_user(
    db: AsyncSession,
    user_id: int,
    *,
    now: Optional[datetime] = None,
) -> List[UserPlanEntitlement]:
    conditions = [
        UserPlanEntitlement.user_id == user_id,
        UserPlanEntitlement.is_active == True,
    ]
    if now is not None:
        conditions.append(
            (UserPlanEntitlement.ends_at.is_(None)) | (UserPlanEntitlement.ends_at > now)
        )

    result = await db.execute(
        select(UserPlanEntitlement)
        .where(*conditions)
        .options(
            selectinload(UserPlanEntitlement.plan),
            selectinload(UserPlanEntitlement.plan_option),
        )
        .order_by(UserPlanEntitlement.created_at)
    )
    return list(result.scalars().all())


async def get_active_standalone_entitlement(
    db: AsyncSession,
    user_id: int,
    *,
    now: Optional[datetime] = None,
) -> Optional[UserPlanEntitlement]:
    conditions = [
        UserPlanEntitlement.user_id == user_id,
        UserPlanEntitlement.is_active == True,
        PricingPlan.plan_kind == "standalone",
    ]
    if now is not None:
        conditions.append(
            (UserPlanEntitlement.ends_at.is_(None)) | (UserPlanEntitlement.ends_at > now)
        )

    result = await db.execute(
        select(UserPlanEntitlement)
        .join(PricingPlan, UserPlanEntitlement.plan_id == PricingPlan.id)
        .where(*conditions)
        .options(
            selectinload(UserPlanEntitlement.plan),
            selectinload(UserPlanEntitlement.plan_option),
        )
        .order_by(UserPlanEntitlement.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_entitlement(
    db: AsyncSession,
    **kwargs,
) -> UserPlanEntitlement:
    entitlement = UserPlanEntitlement(**kwargs)
    db.add(entitlement)
    await db.flush()
    await db.refresh(entitlement)
    return entitlement


async def deactivate_entitlement(
    db: AsyncSession,
    entitlement_id: int,
    *,
    deactivated_at: datetime,
    reason: str,
) -> Optional[UserPlanEntitlement]:
    entitlement = await get_entitlement_by_id(db, entitlement_id)
    if entitlement is None:
        return None
    entitlement.is_active = False
    entitlement.deactivated_at = deactivated_at
    entitlement.deactivation_reason = reason
    await db.flush()
    await db.refresh(entitlement)
    return entitlement
