"""
Catalog tariff activation — creates UserPlanEntitlement records after payment.
No Remnawave I/O here; see tariff_sync.py for panel sync.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Payment, PricingPlanOption

logger = logging.getLogger(__name__)


def compute_ends_at(option: PricingPlanOption, starts_at: datetime) -> Optional[datetime]:
    """Return ends_at for the given option starting at starts_at."""
    from bot.utils.date_utils import add_months
    if option.duration_months:
        return add_months(starts_at, option.duration_months)
    if option.duration_days:
        return starts_at + timedelta(days=option.duration_days)
    return None


async def create_standalone_entitlement(
    session: AsyncSession,
    *,
    payment: Payment,
    now: datetime,
) -> Optional[dict]:
    """
    Create or replace standalone entitlement for a catalog payment.
    Idempotent: if entitlement-payment link already exists, returns existing data.
    Returns {"end_date", "entitlement_id", "traffic_bytes"} or None on failure.
    """
    from core.dal import plan_entitlement_dal, entitlement_payment_dal
    from core.dal.pricing_plan_dal import get_plan_option_by_id

    # Idempotency check
    existing_links = await entitlement_payment_dal.get_links_for_payment(session, payment.payment_id)
    if existing_links:
        logger.info("Standalone activation for payment %s already done (idempotent)", payment.payment_id)
        ent = await plan_entitlement_dal.get_entitlement_by_id(session, existing_links[0].entitlement_id)
        if ent:
            return {
                "end_date": ent.ends_at,
                "entitlement_id": ent.id,
                "traffic_bytes": ent.traffic_limit_bytes_added,
                "already_done": True,
            }

    opt = await get_plan_option_by_id(session, payment.pricing_plan_option_id)
    if not opt or not opt.plan:
        logger.error(
            "create_standalone_entitlement: option %s not found for payment %s",
            payment.pricing_plan_option_id, payment.payment_id,
        )
        return None

    plan = opt.plan
    user_id = payment.user_id

    # Determine starts_at: extend from existing standalone end if still active
    existing_standalone = await plan_entitlement_dal.get_active_standalone_entitlement(
        session, user_id, now=now
    )
    if existing_standalone and existing_standalone.ends_at and existing_standalone.ends_at > now:
        starts_at = existing_standalone.ends_at
    else:
        starts_at = now

    ends_at = compute_ends_at(opt, starts_at)

    # Deactivate old standalone — продление того же плана vs смена плана
    if existing_standalone:
        deactivation_reason = (
            "plan_renewed" if existing_standalone.plan_id == plan.id else "plan_switched"
        )
        await plan_entitlement_dal.deactivate_entitlement(
            session,
            existing_standalone.id,
            deactivated_at=now,
            reason=deactivation_reason,
        )

    traffic_bytes = int(float(opt.traffic_gb) * (1024 ** 3)) if opt.traffic_gb else 0

    new_ent = await plan_entitlement_dal.create_entitlement(
        session,
        user_id=user_id,
        plan_id=plan.id,
        plan_option_id=opt.id,
        starts_at=starts_at,
        ends_at=ends_at,
        traffic_limit_bytes_added=traffic_bytes,
        is_active=True,
        auto_renew_enabled=True,
    )

    purpose = "trial" if plan.is_trial else "purchase"
    await entitlement_payment_dal.create_link(
        session,
        entitlement_id=new_ent.id,
        payment_id=payment.payment_id,
        purpose=purpose,
    )

    payment.activation_status = "succeeded"
    await session.flush()

    logger.info(
        "Standalone entitlement created: user=%s plan=%s option=%s ends_at=%s",
        user_id, plan.id, opt.id, ends_at,
    )
    return {
        "end_date": ends_at,
        "entitlement_id": new_ent.id,
        "traffic_bytes": traffic_bytes,
    }


async def create_addon_entitlement(
    session: AsyncSession,
    *,
    payment: Payment,
    now: datetime,
) -> Optional[dict]:
    """
    Create addon entitlement tied to active standalone ends_at.
    Idempotent: if entitlement-payment link already exists, returns existing data.
    Returns {"end_date", "entitlement_id", "traffic_bytes"} or None on failure.
    """
    from core.dal import plan_entitlement_dal, entitlement_payment_dal
    from core.dal.pricing_plan_dal import get_plan_option_by_id

    # Idempotency check
    existing_links = await entitlement_payment_dal.get_links_for_payment(session, payment.payment_id)
    if existing_links:
        logger.info("Addon activation for payment %s already done (idempotent)", payment.payment_id)
        ent = await plan_entitlement_dal.get_entitlement_by_id(session, existing_links[0].entitlement_id)
        if ent:
            return {
                "end_date": ent.ends_at,
                "entitlement_id": ent.id,
                "traffic_bytes": ent.traffic_limit_bytes_added,
                "already_done": True,
            }

    standalone = await plan_entitlement_dal.get_active_standalone_entitlement(
        session, payment.user_id, now=now
    )
    if not standalone:
        logger.error(
            "create_addon_entitlement: no active standalone for user=%s payment=%s",
            payment.user_id, payment.payment_id,
        )
        return None

    opt = await get_plan_option_by_id(session, payment.pricing_plan_option_id)
    if not opt or not opt.plan:
        logger.error(
            "create_addon_entitlement: option %s not found for payment %s",
            payment.pricing_plan_option_id, payment.payment_id,
        )
        return None

    ends_at = standalone.ends_at
    traffic_bytes = int(float(opt.traffic_gb) * (1024 ** 3)) if opt.traffic_gb else 0

    new_ent = await plan_entitlement_dal.create_entitlement(
        session,
        user_id=payment.user_id,
        plan_id=opt.plan_id,
        plan_option_id=opt.id,
        starts_at=now,
        ends_at=ends_at,
        traffic_limit_bytes_added=traffic_bytes,
        is_active=True,
        auto_renew_enabled=True,
    )

    await entitlement_payment_dal.create_link(
        session,
        entitlement_id=new_ent.id,
        payment_id=payment.payment_id,
        purpose="purchase",
    )

    payment.activation_status = "succeeded"
    await session.flush()

    logger.info(
        "Addon entitlement created: user=%s plan=%s option=%s ends_at=%s traffic_bytes=%s",
        payment.user_id, opt.plan_id, opt.id, ends_at, traffic_bytes,
    )
    return {
        "end_date": ends_at,
        "entitlement_id": new_ent.id,
        "traffic_bytes": traffic_bytes,
    }
