from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.models import PricingPlan


async def get_all_plans(db: AsyncSession) -> List[PricingPlan]:
    result = await db.execute(select(PricingPlan).order_by(PricingPlan.sort_order, PricingPlan.duration_months))
    return list(result.scalars().all())


async def get_enabled_plans(db: AsyncSession) -> List[PricingPlan]:
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.is_enabled == True)
        .order_by(PricingPlan.sort_order, PricingPlan.duration_months)
    )
    return list(result.scalars().all())


async def get_plan_by_id(db: AsyncSession, plan_id: int) -> Optional[PricingPlan]:
    result = await db.execute(select(PricingPlan).where(PricingPlan.id == plan_id))
    return result.scalar_one_or_none()


async def get_plan_by_months(db: AsyncSession, duration_months: int) -> Optional[PricingPlan]:
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.duration_months == duration_months, PricingPlan.is_enabled == True)
    )
    return result.scalar_one_or_none()


async def create_plan(db: AsyncSession, **kwargs) -> PricingPlan:
    plan = PricingPlan(**kwargs)
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


async def update_plan(db: AsyncSession, plan_id: int, **kwargs) -> Optional[PricingPlan]:
    plan = await get_plan_by_id(db, plan_id)
    if plan is None:
        return None
    for key, value in kwargs.items():
        if hasattr(plan, key):
            setattr(plan, key, value)
    await db.flush()
    await db.refresh(plan)
    return plan


async def delete_plan(db: AsyncSession, plan_id: int) -> bool:
    plan = await get_plan_by_id(db, plan_id)
    if plan is None:
        return False
    await db.delete(plan)
    await db.flush()
    return True
