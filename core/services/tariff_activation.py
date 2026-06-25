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


async def _create_addon_entitlement_record(
    session: AsyncSession,
    *,
    payment: Payment,
    option_id: int,
    ends_at: Optional[datetime],
    now: datetime,
):
    """Create a single addon entitlement tied to ``ends_at`` and link it to ``payment``.

    Shared by the standalone-account top-up flow (create_addon_entitlement) and the
    combined "standalone + new addon" purchase flow (create_standalone_entitlement).
    Returns the created entitlement or None when the option is invalid.
    """
    from core.dal import plan_entitlement_dal, entitlement_payment_dal
    from core.dal.pricing_plan_dal import get_plan_option_by_id

    opt = await get_plan_option_by_id(session, option_id)
    if not opt or not opt.plan or opt.plan.plan_kind != "addon":
        logger.error(
            "_create_addon_entitlement_record: addon option %s invalid for payment %s",
            option_id, payment.payment_id,
        )
        return None

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
    logger.info(
        "Addon entitlement created: user=%s plan=%s option=%s ends_at=%s traffic_bytes=%s",
        payment.user_id, opt.plan_id, opt.id, ends_at, traffic_bytes,
    )
    return new_ent


async def _apply_new_addons_from_snapshot(
    session: AsyncSession,
    *,
    payment: Payment,
    standalone,
    now: datetime,
) -> int:
    """Create entitlements for freshly-purchased addons bundled into a standalone payment.

    The addon period is aligned to the new standalone end (full-price purchase).
    """
    from core.services.tariff_renewal_bundle import parse_bundle_snapshot

    snapshot = parse_bundle_snapshot(payment)
    if not snapshot:
        return 0

    created = 0
    for item in snapshot.get("new_addons") or []:
        try:
            option_id = int(item.get("option_id"))
        except (TypeError, ValueError):
            continue
        ent = await _create_addon_entitlement_record(
            session,
            payment=payment,
            option_id=option_id,
            ends_at=standalone.ends_at,
            now=now,
        )
        if ent:
            created += 1

    if created:
        await session.flush()
        logger.info(
            "Created %s new addon entitlement(s) from purchase bundle payment %s until %s",
            created, payment.payment_id, standalone.ends_at,
        )
    return created


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

    is_renewal = bool(existing_standalone and existing_standalone.plan_id == plan.id)

    # Deactivate old standalone — продление того же плана vs смена плана
    if existing_standalone:
        deactivation_reason = "plan_renewed" if is_renewal else "plan_switched"
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

    purpose = "trial" if plan.is_trial else ("renewal" if is_renewal else "purchase")
    await entitlement_payment_dal.create_link(
        session,
        entitlement_id=new_ent.id,
        payment_id=payment.payment_id,
        purpose=purpose,
    )

    if is_renewal and payment.auto_renew_bundle_snapshot:
        from core.services.tariff_renewal_bundle import apply_bundle_addon_renewals
        await apply_bundle_addon_renewals(
            session,
            payment=payment,
            new_standalone=new_ent,
            now=now,
        )

    # Combined purchase: create entitlement(s) for newly bought addons bundled into
    # this standalone payment (period aligned to the new standalone end).
    if payment.auto_renew_bundle_snapshot:
        await _apply_new_addons_from_snapshot(
            session,
            payment=payment,
            standalone=new_ent,
            now=now,
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

    new_ent = await _create_addon_entitlement_record(
        session,
        payment=payment,
        option_id=payment.pricing_plan_option_id,
        ends_at=standalone.ends_at,
        now=now,
    )
    if not new_ent:
        logger.error(
            "create_addon_entitlement: option %s not found for payment %s",
            payment.pricing_plan_option_id, payment.payment_id,
        )
        return None

    ends_at = new_ent.ends_at
    traffic_bytes = new_ent.traffic_limit_bytes_added

    payment.activation_status = "succeeded"
    await session.flush()

    return {
        "end_date": ends_at,
        "entitlement_id": new_ent.id,
        "traffic_bytes": traffic_bytes,
    }
