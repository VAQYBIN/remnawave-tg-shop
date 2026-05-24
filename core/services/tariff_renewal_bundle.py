"""Renewal bundle helpers for catalog standalone + addon auto-renew."""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Payment, PricingPlanOption, UserPlanEntitlement

logger = logging.getLogger(__name__)


def _price_add(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None:
        return None
    return round(float(a) + float(b), 2)


def _stars_add(a: Optional[int], b: Optional[int]) -> Optional[int]:
    if a is None or b is None:
        return None
    return int(a) + int(b)


async def build_standalone_renewal_bundle(
    session: AsyncSession,
    *,
    user_id: int,
    standalone_option: PricingPlanOption,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    """Return bundle data for renewing the same active standalone plan.

    Addons are included only when they are active, have auto-renew enabled, and
    still point to an enabled, purchasable option. Disabled addon auto-renew is
    deliberately excluded so the addon remains active only until its old end.
    """
    from core.dal.plan_entitlement_dal import (
        get_active_entitlements_for_user,
        get_active_standalone_entitlement,
    )
    from core.services.plan_purchase_policy import can_purchase_plan_option

    plan = standalone_option.plan
    if not plan or plan.plan_kind != "standalone":
        return None

    now = now or datetime.now(timezone.utc)
    current_standalone = await get_active_standalone_entitlement(session, user_id, now=now)
    if not current_standalone or current_standalone.plan_id != plan.id:
        return None

    total_rub = float(standalone_option.price_rub) if standalone_option.price_rub is not None else None
    total_stars = standalone_option.price_stars
    snapshot: dict[str, Any] = {
        "standalone": {
            "entitlement_id": current_standalone.id,
            "plan_id": plan.id,
            "option_id": standalone_option.id,
            "price_rub": total_rub,
            "price_stars": total_stars,
        },
        "addons": [],
    }

    entitlements = await get_active_entitlements_for_user(session, user_id, now=now)
    for entitlement in entitlements:
        if entitlement.id == current_standalone.id:
            continue
        if not entitlement.auto_renew_enabled:
            continue
        if not entitlement.plan or entitlement.plan.plan_kind != "addon":
            continue
        option = entitlement.plan_option
        if option is None:
            continue
        allowed, reason = await can_purchase_plan_option(session, [user_id], option, now=now)
        if not allowed:
            logger.info(
                "Skipping addon entitlement %s from renewal bundle: %s",
                entitlement.id,
                reason,
            )
            continue

        addon_rub = float(option.price_rub) if option.price_rub is not None else None
        addon_stars = option.price_stars
        snapshot["addons"].append({
            "entitlement_id": entitlement.id,
            "plan_id": entitlement.plan_id,
            "option_id": option.id,
            "price_rub": addon_rub,
            "price_stars": addon_stars,
        })
        total_rub = _price_add(total_rub, addon_rub)
        total_stars = _stars_add(total_stars, addon_stars)

    if not snapshot["addons"]:
        return None

    return {
        "snapshot": snapshot,
        "snapshot_json": json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
        "total_price_rub": total_rub,
        "total_price_stars": total_stars,
    }


def parse_bundle_snapshot(payment: Payment) -> Optional[dict[str, Any]]:
    raw = payment.auto_renew_bundle_snapshot
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        logger.exception("Invalid auto_renew_bundle_snapshot for payment %s", payment.payment_id)
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("addons"), list):
        return None
    return payload


async def apply_bundle_addon_renewals(
    session: AsyncSession,
    *,
    payment: Payment,
    new_standalone: UserPlanEntitlement,
    now: datetime,
) -> int:
    """Extend addon entitlements from payment snapshot to new standalone end."""
    from core.dal import entitlement_payment_dal, plan_entitlement_dal

    snapshot = parse_bundle_snapshot(payment)
    if not snapshot or not new_standalone.ends_at:
        return 0

    renewed = 0
    for addon in snapshot.get("addons") or []:
        try:
            entitlement_id = int(addon.get("entitlement_id"))
        except (TypeError, ValueError):
            continue

        entitlement = await plan_entitlement_dal.get_entitlement_by_id(session, entitlement_id)
        if not entitlement or entitlement.user_id != payment.user_id:
            continue
        if not entitlement.plan or entitlement.plan.plan_kind != "addon":
            continue
        if not entitlement.is_active:
            continue
        if not entitlement.auto_renew_enabled:
            continue

        entitlement.ends_at = new_standalone.ends_at
        await entitlement_payment_dal.create_link(
            session,
            entitlement_id=entitlement.id,
            payment_id=payment.payment_id,
            purpose="renewal",
        )
        renewed += 1

    await session.flush()
    logger.info(
        "Applied %s addon renewals from bundle payment %s until %s",
        renewed,
        payment.payment_id,
        new_standalone.ends_at,
    )
    return renewed

