from dataclasses import dataclass
from typing import Optional, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import PricingPlan, PricingPlanOption, UserPlanEntitlement


LEGACY_DEFAULT_SLUG = "legacy-default"


@dataclass
class LegacyTimePlanView:
    """Compatibility shape used by the old admin plans page and public time flow."""

    id: int
    duration_months: int
    label: Optional[str]
    price_rub: Optional[float]
    price_stars: Optional[int]
    is_enabled: bool
    sort_order: int
    created_at: object
    updated_at: object


def _option_to_legacy_view(option: PricingPlanOption) -> LegacyTimePlanView:
    return LegacyTimePlanView(
        id=option.id,
        duration_months=option.duration_months or 0,
        label=None,
        price_rub=option.price_rub,
        price_stars=option.price_stars,
        is_enabled=bool(option.is_enabled and option.plan and option.plan.is_enabled),
        sort_order=option.sort_order,
        created_at=option.created_at,
        updated_at=option.updated_at,
    )


async def get_plan_by_slug(db: AsyncSession, slug: str) -> Optional[PricingPlan]:
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.slug == slug)
        .options(selectinload(PricingPlan.options))
    )
    return result.scalar_one_or_none()


async def get_plans(
    db: AsyncSession,
    *,
    enabled_only: bool = False,
    include_archived: bool = False,
) -> List[PricingPlan]:
    stmt = select(PricingPlan).options(selectinload(PricingPlan.options)).order_by(
        PricingPlan.sort_order,
        PricingPlan.id,
    )
    if enabled_only:
        stmt = stmt.where(PricingPlan.is_enabled == True)
    if not include_archived:
        stmt = stmt.where(PricingPlan.is_archived == False)
    result = await db.execute(stmt)
    return list(result.scalars().unique().all())


async def get_plan_by_id(db: AsyncSession, plan_id: int) -> Optional[PricingPlan]:
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.id == plan_id)
        .options(selectinload(PricingPlan.options))
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


async def has_any_entitlements(db: AsyncSession, plan_id: int) -> bool:
    result = await db.execute(
        select(func.count(UserPlanEntitlement.id)).where(
            UserPlanEntitlement.plan_id == plan_id,
        )
    )
    return result.scalar_one() > 0


async def archive_plan(db: AsyncSession, plan_id: int) -> Optional[PricingPlan]:
    return await update_plan(db, plan_id, is_archived=True, is_enabled=False)


async def unarchive_plan(db: AsyncSession, plan_id: int) -> Optional[PricingPlan]:
    # Only removes the archived flag; is_enabled stays False so the admin must
    # explicitly re-publish the plan before users can buy it.
    return await update_plan(db, plan_id, is_archived=False)


async def create_plan_option(db: AsyncSession, **kwargs) -> PricingPlanOption:
    option = PricingPlanOption(**kwargs)
    db.add(option)
    await db.flush()
    await db.refresh(option)
    return option


async def get_plan_option_by_id(db: AsyncSession, option_id: int) -> Optional[PricingPlanOption]:
    result = await db.execute(
        select(PricingPlanOption)
        .where(PricingPlanOption.id == option_id)
        .options(selectinload(PricingPlanOption.plan))
    )
    return result.scalar_one_or_none()


async def get_enabled_plan_options(db: AsyncSession) -> List[PricingPlanOption]:
    result = await db.execute(
        select(PricingPlanOption)
        .join(PricingPlan)
        .where(
            PricingPlan.is_enabled == True,
            PricingPlan.is_archived == False,
            PricingPlanOption.is_enabled == True,
        )
        .options(selectinload(PricingPlanOption.plan))
        .order_by(PricingPlan.sort_order, PricingPlanOption.sort_order, PricingPlanOption.id)
    )
    return list(result.scalars().all())


async def update_plan_option(
    db: AsyncSession,
    option_id: int,
    **kwargs,
) -> Optional[PricingPlanOption]:
    option = await get_plan_option_by_id(db, option_id)
    if option is None:
        return None
    for key, value in kwargs.items():
        if hasattr(option, key):
            setattr(option, key, value)
    await db.flush()
    await db.refresh(option)
    return option


async def delete_plan_option(db: AsyncSession, option_id: int) -> bool:
    option = await get_plan_option_by_id(db, option_id)
    if option is None:
        return False
    await db.delete(option)
    await db.flush()
    return True


async def get_legacy_default_plan(db: AsyncSession) -> Optional[PricingPlan]:
    return await get_plan_by_slug(db, LEGACY_DEFAULT_SLUG)


async def ensure_legacy_default_plan(
    db: AsyncSession,
    *,
    squad_uuid: Optional[str] = None,
    is_enabled: bool = False,
) -> PricingPlan:
    plan = await get_legacy_default_plan(db)
    if plan is not None:
        return plan

    plan = PricingPlan(
        slug=LEGACY_DEFAULT_SLUG,
        name_ru="Стандартный",
        name_en="Default",
        description_ru="Тариф, созданный автоматически для совместимости.",
        description_en="Compatibility plan created automatically.",
        remnawave_squad_uuid=squad_uuid,
        remnawave_squad_uuids=[squad_uuid] if squad_uuid else None,
        plan_kind="standalone",
        billing_model="time",
        traffic_reset_strategy="NO_RESET",
        is_trial=False,
        is_enabled=is_enabled,
        sort_order=0,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


async def get_all_plans(db: AsyncSession) -> List[LegacyTimePlanView]:
    """Compatibility list for the old admin `/plans` endpoint."""
    plan = await get_legacy_default_plan(db)
    if not plan:
        return []
    result = await db.execute(
        select(PricingPlanOption)
        .where(PricingPlanOption.plan_id == plan.id)
        .options(selectinload(PricingPlanOption.plan))
        .order_by(PricingPlanOption.sort_order, PricingPlanOption.duration_months)
    )
    return [_option_to_legacy_view(option) for option in result.scalars().all()]


async def get_enabled_plans(db: AsyncSession) -> List[LegacyTimePlanView]:
    """Compatibility list for legacy time-based purchase flow."""
    result = await db.execute(
        select(PricingPlanOption)
        .join(PricingPlan)
        .where(
            PricingPlan.slug == LEGACY_DEFAULT_SLUG,
            PricingPlan.is_enabled == True,
            PricingPlan.is_archived == False,
            PricingPlanOption.is_enabled == True,
            PricingPlanOption.duration_months.is_not(None),
        )
        .options(selectinload(PricingPlanOption.plan))
        .order_by(PricingPlanOption.sort_order, PricingPlanOption.duration_months)
    )
    return [_option_to_legacy_view(option) for option in result.scalars().all()]


async def get_plan_by_months(db: AsyncSession, duration_months: int) -> Optional[LegacyTimePlanView]:
    result = await db.execute(
        select(PricingPlanOption)
        .join(PricingPlan)
        .where(
            PricingPlan.slug == LEGACY_DEFAULT_SLUG,
            PricingPlan.is_enabled == True,
            PricingPlan.is_archived == False,
            PricingPlanOption.duration_months == duration_months,
            PricingPlanOption.is_enabled == True,
        )
        .options(selectinload(PricingPlanOption.plan))
        .order_by(PricingPlanOption.sort_order, PricingPlanOption.id)
        .limit(1)
    )
    option = result.scalar_one_or_none()
    return _option_to_legacy_view(option) if option else None


def _validate_legacy_enable(plan: PricingPlan, price_rub: object, price_stars: object) -> None:
    if not (plan.remnawave_squad_uuids or plan.remnawave_squad_uuid):
        raise ValueError(
            "Невозможно включить тариф: USER_SQUAD_UUIDS не настроен (нет squad UUID)."
        )
    if not price_rub and not price_stars:
        raise ValueError(
            "Невозможно включить тариф: не указана цена (price_rub или price_stars)."
        )


async def create_legacy_time_option(db: AsyncSession, **kwargs) -> LegacyTimePlanView:
    plan = await ensure_legacy_default_plan(db)
    if kwargs.get("is_enabled"):
        if plan.is_archived:
            raise ValueError("Нельзя включить опцию архивного тарифа. Сначала восстановите тариф из архива.")
        _validate_legacy_enable(plan, kwargs.get("price_rub"), kwargs.get("price_stars"))
    plan.is_enabled = bool(not plan.is_archived and (kwargs.get("is_enabled", False) or plan.is_enabled))
    option = await create_plan_option(
        db,
        plan_id=plan.id,
        duration_months=kwargs.get("duration_months"),
        traffic_unlimited=True,
        price_rub=kwargs.get("price_rub"),
        price_stars=kwargs.get("price_stars"),
        is_enabled=kwargs.get("is_enabled", False),
        sort_order=kwargs.get("sort_order", 0),
    )
    option.plan = plan
    return _option_to_legacy_view(option)


async def update_legacy_time_option(
    db: AsyncSession,
    option_id: int,
    **kwargs,
) -> Optional[LegacyTimePlanView]:
    option = await get_plan_option_by_id(db, option_id)
    if option is None or option.plan.slug != LEGACY_DEFAULT_SLUG:
        return None
    allowed = {"duration_months", "price_rub", "price_stars", "is_enabled", "sort_order"}
    if "is_enabled" in kwargs and kwargs["is_enabled"]:
        if option.plan.is_archived:
            raise ValueError("Нельзя включить опцию архивного тарифа. Сначала восстановите тариф из архива.")
        price_rub = kwargs.get("price_rub", option.price_rub)
        price_stars = kwargs.get("price_stars", option.price_stars)
        _validate_legacy_enable(option.plan, price_rub, price_stars)
    for key, value in kwargs.items():
        if key in allowed:
            setattr(option, key, value)
    if "is_enabled" in kwargs and kwargs["is_enabled"] and not option.plan.is_archived:
        option.plan.is_enabled = True
    await db.flush()
    await db.refresh(option)
    return _option_to_legacy_view(option)


async def delete_legacy_time_option(db: AsyncSession, option_id: int) -> bool:
    option = await get_plan_option_by_id(db, option_id)
    if option is None or option.plan.slug != LEGACY_DEFAULT_SLUG:
        return False
    await db.delete(option)
    await db.flush()
    return True
