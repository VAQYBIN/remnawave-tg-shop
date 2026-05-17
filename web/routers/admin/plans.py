import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.services.panel_client import PanelApiService
from core.dal.pricing_plan_dal import (
    get_plans,
    get_plan_by_id,
    get_plan_by_slug,
    create_plan,
    update_plan,
    delete_plan,
    archive_plan,
    unarchive_plan,
    has_any_entitlements,
    create_plan_option,
    get_plan_option_by_id,
    update_plan_option,
    delete_plan_option,
)
from db.models import Account, PricingPlan, PricingPlanOption, UserPlanEntitlement
from web.dependencies import get_db, get_current_admin, get_settings_dep
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log
from web.schemas.admin.plans import (
    PricingPlanResponse,
    PricingPlanListResponse,
    PricingPlanCreateRequest,
    PricingPlanUpdateRequest,
    PricingPlanOptionResponse,
    PricingPlanOptionCreateRequest,
    PricingPlanOptionUpdateRequest,
    PlanArchiveResponse,
    _validate_plan_combination,
    slugify,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────

async def _validate_squad_uuid(squad_uuid: str, settings: Settings) -> Optional[str]:
    """Call Remnawave API to verify squad UUID. Returns squad name snapshot or raises 422."""
    panel = PanelApiService(settings)
    is_valid, name, error_msg = await panel.validate_internal_squad(squad_uuid)
    if not is_valid:
        raise HTTPException(
            status_code=422,
            detail=f"Remnawave squad UUID недействителен или панель недоступна: {error_msg}",
        )
    return name


async def _unique_slug(db: AsyncSession, base: str, exclude_id: Optional[int] = None) -> str:
    slug, counter = base, 2
    while True:
        result = await db.execute(select(PricingPlan).where(PricingPlan.slug == slug))
        existing = result.scalar_one_or_none()
        if existing is None or (exclude_id is not None and existing.id == exclude_id):
            return slug
        slug = f"{base}-{counter}"
        counter += 1


def _check_option_create(plan: PricingPlan, body: PricingPlanOptionCreateRequest) -> None:
    bm = plan.billing_model
    has_duration = body.duration_months is not None or body.duration_days is not None

    if bm in ("time", "hybrid") and not has_duration:
        raise ValueError(f"Для billing_model={bm} необходимо указать duration_months или duration_days")
    if bm == "time" and not body.traffic_unlimited and body.traffic_gb is None:
        raise ValueError("Для billing_model=time необходимо указать traffic_gb или установить traffic_unlimited=true")
    if bm in ("traffic", "hybrid") and body.traffic_gb is None and not body.traffic_unlimited:
        raise ValueError(f"Для billing_model={bm} необходимо указать traffic_gb")
    if plan.is_trial:
        if body.price_rub is not None and body.price_rub != 0:
            raise ValueError("Пробный тариф должен иметь price_rub=0")
        if body.price_stars is not None:
            raise ValueError("Пробный тариф не должен иметь price_stars")


def _check_option_update(
    plan: PricingPlan,
    option: PricingPlanOption,
    body: PricingPlanOptionUpdateRequest,
) -> None:
    bm = plan.billing_model

    eff_months = body.duration_months if body.duration_months is not None else option.duration_months
    eff_days = body.duration_days if body.duration_days is not None else option.duration_days
    eff_traffic_gb = body.traffic_gb if body.traffic_gb is not None else option.traffic_gb
    eff_unlimited = body.traffic_unlimited if body.traffic_unlimited is not None else option.traffic_unlimited
    eff_price_rub = body.price_rub if body.price_rub is not None else option.price_rub
    eff_price_stars = body.price_stars if body.price_stars is not None else option.price_stars

    if eff_months is not None and eff_days is not None:
        raise ValueError("Option не может иметь одновременно duration_months и duration_days")

    has_duration = eff_months is not None or eff_days is not None
    if bm in ("time", "hybrid") and not has_duration:
        raise ValueError(f"Для billing_model={bm} необходимо иметь duration_months или duration_days")
    if bm == "time" and not eff_unlimited and eff_traffic_gb is None:
        raise ValueError("Для billing_model=time необходимо указать traffic_gb или установить traffic_unlimited=true")
    if bm in ("traffic", "hybrid") and eff_traffic_gb is None and not eff_unlimited:
        raise ValueError(f"Для billing_model={bm} необходимо указать traffic_gb")
    if plan.is_trial:
        if eff_price_rub is not None and eff_price_rub != 0:
            raise ValueError("Пробный тариф должен иметь price_rub=0")
        if eff_price_stars is not None:
            raise ValueError("Пробный тариф не должен иметь price_stars")


async def _get_plan_or_404(db: AsyncSession, plan_id: int) -> PricingPlan:
    plan = await get_plan_by_id(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return plan


async def _active_entitlement_count(db: AsyncSession, plan_id: int) -> int:
    result = await db.execute(
        select(func.count(UserPlanEntitlement.id)).where(
            UserPlanEntitlement.plan_id == plan_id,
            UserPlanEntitlement.is_active == True,
        )
    )
    return result.scalar_one()


async def _any_entitlement_count(db: AsyncSession, plan_id: int) -> int:
    """Total entitlements for plan (active and historical). Used to guard DELETE."""
    result = await db.execute(
        select(func.count(UserPlanEntitlement.id)).where(
            UserPlanEntitlement.plan_id == plan_id,
        )
    )
    return result.scalar_one()


# ── Plan CRUD ──────────────────────────────────────────────────────────────

@router.get("/plans", response_model=PricingPlanListResponse)
async def list_plans(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
) -> PricingPlanListResponse:
    plans = await get_plans(db, include_archived=True)
    return PricingPlanListResponse(
        items=[PricingPlanResponse.model_validate(p) for p in plans],
        total=len(plans),
    )


@router.post(
    "/plans",
    response_model=PricingPlanResponse,
    status_code=201,
    dependencies=[Depends(admin_action_limit)],
)
async def create_new_plan(
    body: PricingPlanCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
) -> PricingPlanResponse:
    squad_name: Optional[str] = None
    if body.remnawave_squad_uuid:
        squad_name = await _validate_squad_uuid(body.remnawave_squad_uuid, settings)

    base = slugify(body.slug) if body.slug else slugify(body.name_ru)
    slug = await _unique_slug(db, base)

    plan = await create_plan(
        db,
        slug=slug,
        name_ru=body.name_ru,
        name_en=body.name_en,
        description_ru=body.description_ru,
        description_en=body.description_en,
        remnawave_squad_uuid=body.remnawave_squad_uuid,
        remnawave_squad_name_snapshot=squad_name,
        plan_kind=body.plan_kind,
        billing_model=body.billing_model,
        traffic_reset_strategy=body.traffic_reset_strategy,
        min_price_rub=body.min_price_rub,
        min_price_stars=body.min_price_stars,
        is_trial=body.is_trial,
        is_enabled=body.is_enabled,
        sort_order=body.sort_order,
    )

    await add_admin_audit_log(
        db, admin, "admin_tariff_create",
        details={"plan_id": plan.id, "slug": slug, "name_ru": body.name_ru},
    )
    await db.commit()

    plan = await get_plan_by_id(db, plan.id)
    return PricingPlanResponse.model_validate(plan)


@router.patch(
    "/plans/{plan_id}",
    response_model=PricingPlanResponse,
    dependencies=[Depends(admin_action_limit)],
)
async def update_existing_plan(
    plan_id: int,
    body: PricingPlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
) -> PricingPlanResponse:
    plan = await _get_plan_or_404(db, plan_id)

    updates = body.model_dump(exclude_none=True)

    if updates.get("is_enabled") and plan.is_archived:
        raise HTTPException(
            status_code=409,
            detail="Нельзя включить архивный тариф. Сначала восстановите его из архива.",
        )

    if "plan_kind" in updates and updates["plan_kind"] != plan.plan_kind:
        count = await _active_entitlement_count(db, plan_id)
        if count > 0:
            raise HTTPException(
                status_code=409,
                detail="Нельзя менять plan_kind тарифа с активными правами пользователей",
            )

    if "remnawave_squad_uuid" in updates:
        uuid_val = updates["remnawave_squad_uuid"]
        if uuid_val:
            snapshot = await _validate_squad_uuid(uuid_val, settings)
            updates["remnawave_squad_name_snapshot"] = snapshot
        else:
            updates["remnawave_squad_name_snapshot"] = None

    eff_billing_model = updates.get("billing_model", plan.billing_model)
    eff_reset_strategy = updates.get("traffic_reset_strategy", plan.traffic_reset_strategy)
    eff_plan_kind = updates.get("plan_kind", plan.plan_kind)
    eff_is_trial = updates.get("is_trial", plan.is_trial)
    try:
        _validate_plan_combination(eff_plan_kind, eff_billing_model, eff_is_trial, eff_reset_strategy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await update_plan(db, plan_id, **updates)
    await add_admin_audit_log(
        db, admin, "admin_tariff_update",
        details={"plan_id": plan_id, "updates": {k: v for k, v in updates.items() if k != "remnawave_squad_name_snapshot"}},
    )
    await db.commit()

    plan = await get_plan_by_id(db, plan_id)
    return PricingPlanResponse.model_validate(plan)


@router.delete(
    "/plans/{plan_id}",
    status_code=204,
    dependencies=[Depends(admin_action_limit)],
)
async def delete_existing_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> None:
    await _get_plan_or_404(db, plan_id)

    if await has_any_entitlements(db, plan_id):
        raise HTTPException(
            status_code=409,
            detail="Тариф использовался пользователями и не может быть удалён. Переведите его в архив.",
        )

    await delete_plan(db, plan_id)
    await add_admin_audit_log(db, admin, "admin_tariff_delete", details={"plan_id": plan_id})
    await db.commit()


@router.post(
    "/plans/{plan_id}/archive",
    response_model=PlanArchiveResponse,
    dependencies=[Depends(admin_action_limit)],
)
async def archive_existing_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> PlanArchiveResponse:
    plan = await _get_plan_or_404(db, plan_id)
    if plan.is_archived:
        raise HTTPException(status_code=409, detail="Тариф уже находится в архиве")
    updated = await archive_plan(db, plan_id)
    await add_admin_audit_log(db, admin, "admin_tariff_archive", details={"plan_id": plan_id})
    await db.commit()
    return PlanArchiveResponse(id=updated.id, is_archived=updated.is_archived, is_enabled=updated.is_enabled)


@router.post(
    "/plans/{plan_id}/unarchive",
    response_model=PlanArchiveResponse,
    dependencies=[Depends(admin_action_limit)],
)
async def unarchive_existing_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> PlanArchiveResponse:
    plan = await _get_plan_or_404(db, plan_id)
    if not plan.is_archived:
        raise HTTPException(status_code=409, detail="Тариф не находится в архиве")
    updated = await unarchive_plan(db, plan_id)
    await add_admin_audit_log(db, admin, "admin_tariff_unarchive", details={"plan_id": plan_id})
    await db.commit()
    return PlanArchiveResponse(id=updated.id, is_archived=updated.is_archived, is_enabled=updated.is_enabled)


# ── Option CRUD ────────────────────────────────────────────────────────────

@router.post(
    "/plans/{plan_id}/options",
    response_model=PricingPlanOptionResponse,
    status_code=201,
    dependencies=[Depends(admin_action_limit)],
)
async def add_plan_option(
    plan_id: int,
    body: PricingPlanOptionCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> PricingPlanOptionResponse:
    plan = await _get_plan_or_404(db, plan_id)

    if body.is_enabled and plan.is_archived:
        raise HTTPException(
            status_code=409,
            detail="Нельзя создать включённую опцию для архивного тарифа. Сначала восстановите тариф из архива.",
        )

    try:
        _check_option_create(plan, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    option = await create_plan_option(
        db,
        plan_id=plan_id,
        duration_months=body.duration_months,
        duration_days=body.duration_days,
        traffic_gb=body.traffic_gb,
        traffic_unlimited=body.traffic_unlimited,
        price_rub=body.price_rub,
        price_stars=body.price_stars,
        is_enabled=body.is_enabled,
        sort_order=body.sort_order,
    )

    await add_admin_audit_log(
        db, admin, "admin_tariff_option_create",
        details={"plan_id": plan_id, "option_id": option.id},
    )
    await db.commit()

    option = await get_plan_option_by_id(db, option.id)
    return PricingPlanOptionResponse.model_validate(option)


@router.patch(
    "/plans/{plan_id}/options/{option_id}",
    response_model=PricingPlanOptionResponse,
    dependencies=[Depends(admin_action_limit)],
)
async def update_plan_option_endpoint(
    plan_id: int,
    option_id: int,
    body: PricingPlanOptionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> PricingPlanOptionResponse:
    plan = await _get_plan_or_404(db, plan_id)
    option = await get_plan_option_by_id(db, option_id)
    if option is None or option.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Option не найден")

    if body.is_enabled and plan.is_archived:
        raise HTTPException(
            status_code=409,
            detail="Нельзя включить опцию архивного тарифа. Сначала восстановите тариф из архива.",
        )

    try:
        _check_option_update(plan, option, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    updates = body.model_dump(exclude_none=True)
    await update_plan_option(db, option_id, **updates)
    await add_admin_audit_log(
        db, admin, "admin_tariff_option_update",
        details={"plan_id": plan_id, "option_id": option_id, "updates": updates},
    )
    await db.commit()

    option = await get_plan_option_by_id(db, option_id)
    return PricingPlanOptionResponse.model_validate(option)


@router.delete(
    "/plans/{plan_id}/options/{option_id}",
    status_code=204,
    dependencies=[Depends(admin_action_limit)],
)
async def delete_plan_option_endpoint(
    plan_id: int,
    option_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
) -> None:
    await _get_plan_or_404(db, plan_id)
    option = await get_plan_option_by_id(db, option_id)
    if option is None or option.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Option не найден")

    await delete_plan_option(db, option_id)
    await add_admin_audit_log(
        db, admin, "admin_tariff_option_delete",
        details={"plan_id": plan_id, "option_id": option_id},
    )
    await db.commit()
