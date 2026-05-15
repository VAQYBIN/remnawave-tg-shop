import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal.pricing_plan_dal import ensure_legacy_default_plan
from db.models import PricingPlan, PricingPlanOption

logger = logging.getLogger(__name__)


def _first_user_squad_uuid(settings: Settings) -> Optional[str]:
    squads = settings.parsed_user_squad_uuids
    return squads[0] if squads else None


def _legacy_traffic_payload(settings: Settings) -> dict:
    if settings.USER_TRAFFIC_LIMIT_GB is not None and settings.USER_TRAFFIC_LIMIT_GB > 0:
        return {"traffic_gb": float(settings.USER_TRAFFIC_LIMIT_GB), "traffic_unlimited": False}
    return {"traffic_gb": None, "traffic_unlimited": True}


async def bootstrap_legacy_tariff(db: AsyncSession, settings: Settings) -> None:
    """Ensure a legacy standalone plan exists for old env-based installations.

    This is intentionally best-effort. Missing prices or squads leave the plan
    disabled instead of blocking application startup.
    """
    squad_uuid = _first_user_squad_uuid(settings)
    rub_prices = settings.subscription_options
    stars_prices = settings.stars_subscription_options
    durations = sorted(set(rub_prices) | set(stars_prices))

    has_any_configured_price = bool(durations)
    should_enable = bool(squad_uuid and has_any_configured_price)

    plan = await ensure_legacy_default_plan(
        db,
        squad_uuid=squad_uuid,
        is_enabled=should_enable,
    )

    changed = False
    if not plan.remnawave_squad_uuid and squad_uuid:
        plan.remnawave_squad_uuid = squad_uuid
        changed = True

    if should_enable and not plan.is_enabled:
        plan.is_enabled = True
        changed = True

    if not durations:
        if changed:
            await db.flush()
        logger.warning(
            "Legacy tariff bootstrap skipped prices: RUB_PRICE_* and STARS_PRICE_* are empty."
        )
        return

    result = await db.execute(
        select(PricingPlanOption).where(PricingPlanOption.plan_id == plan.id)
    )
    existing_options = list(result.scalars().all())
    by_months = {
        option.duration_months: option
        for option in existing_options
        if option.duration_months is not None
    }

    traffic_payload = _legacy_traffic_payload(settings)
    for index, months in enumerate(durations, start=1):
        rub_price = rub_prices.get(months)
        stars_price = stars_prices.get(months)
        option = by_months.get(months)
        is_enabled = bool(should_enable and (rub_price is not None or stars_price is not None))

        if option is None:
            db.add(
                PricingPlanOption(
                    plan_id=plan.id,
                    duration_months=months,
                    price_rub=rub_price,
                    price_stars=stars_price,
                    is_enabled=is_enabled,
                    sort_order=index,
                    **traffic_payload,
                )
            )
            changed = True
            continue

        # Fresh installs migrate old disabled seed rows with empty prices. Fill
        # them from env without overwriting admin-configured values.
        if option.price_rub is None and rub_price is not None:
            option.price_rub = rub_price
            changed = True
        if option.price_stars is None and stars_price is not None:
            option.price_stars = stars_price
            changed = True
        if option.traffic_gb is None and not option.traffic_unlimited:
            option.traffic_gb = traffic_payload["traffic_gb"]
            option.traffic_unlimited = traffic_payload["traffic_unlimited"]
            changed = True
        if is_enabled and not option.is_enabled:
            option.is_enabled = True
            changed = True

    if changed:
        await db.flush()
        logger.info("Legacy tariff bootstrap applied to pricing_plans.")
