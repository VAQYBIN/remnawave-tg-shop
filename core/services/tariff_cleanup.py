"""
Tariff cleanup — deactivates expired entitlements and reconciles Remnawave state.

Phase 11:
- Find expired active entitlements.
- Deactivate expired addons.
- Deactivate expired standalone (cascades to its addons).
- Rebuild Remnawave squads after cleanup (single PATCH /users via tariff_sync).
- Never crash on a temporarily unavailable Remnawave; the next cycle reconciles
  whatever was missed.

Note on `subscriptions`: an expired subscription (end_date in the past) is already
excluded from every active-subscription query (they all filter `end_date > now`),
so cleanup does not need to mutate the legacy table to keep reads consistent.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Set

from sqlalchemy.ext.asyncio import AsyncSession

from core.dal import plan_entitlement_dal, user_dal
from core.services.panel_client import PanelApiService
from core.services.tariff_sync import sync_entitlements_to_panel

logger = logging.getLogger(__name__)


async def cleanup_expired_entitlements(
    session: AsyncSession,
    *,
    now: Optional[datetime] = None,
) -> dict:
    """Local-only deactivation of expired entitlements.

    No Remnawave I/O. Returns stats and the set of affected user_ids whose
    panel state should be reconciled afterwards.

    Rules:
    - If a user's standalone is expired -> deactivate it (reason="expired") and
      deactivate ALL its addons (reason="standalone_expired"), regardless of the
      addon's own ends_at.
    - If the standalone is still active -> deactivate only the individually
      expired addons (reason="expired").
    - If there is no active standalone but active addons remain -> deactivate
      those addons (reason="standalone_expired"); an addon cannot live without
      a standalone.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    expired = await plan_entitlement_dal.get_expired_active_entitlements(session, now)

    affected_user_ids: Set[int] = {e.user_id for e in expired}
    stats = {
        "standalone_deactivated": 0,
        "addon_deactivated": 0,
        "users_processed": 0,
    }

    for user_id in affected_user_ids:
        ents = await plan_entitlement_dal.get_all_active_entitlements_for_user(
            session, user_id
        )
        standalone = None
        addons: List = []
        for e in ents:
            if e.plan and e.plan.plan_kind == "standalone":
                standalone = e
            elif e.plan and e.plan.plan_kind == "addon":
                addons.append(e)

        standalone_expired = bool(
            standalone
            and standalone.ends_at is not None
            and standalone.ends_at <= now
        )

        if standalone_expired:
            await plan_entitlement_dal.deactivate_entitlement(
                session, standalone.id, deactivated_at=now, reason="expired"
            )
            stats["standalone_deactivated"] += 1
            # Cascade: every addon dies with the standalone.
            for addon in addons:
                await plan_entitlement_dal.deactivate_entitlement(
                    session, addon.id, deactivated_at=now, reason="standalone_expired"
                )
                stats["addon_deactivated"] += 1
        elif standalone is None:
            # Orphan addons without a standalone — must not stay active.
            for addon in addons:
                await plan_entitlement_dal.deactivate_entitlement(
                    session, addon.id, deactivated_at=now, reason="standalone_expired"
                )
                stats["addon_deactivated"] += 1
        else:
            # Standalone still active: drop only the individually expired addons.
            for addon in addons:
                if addon.ends_at is not None and addon.ends_at <= now:
                    await plan_entitlement_dal.deactivate_entitlement(
                        session, addon.id, deactivated_at=now, reason="expired"
                    )
                    stats["addon_deactivated"] += 1

        stats["users_processed"] += 1

    await session.flush()
    stats["affected_user_ids"] = affected_user_ids
    return stats


async def reconcile_user_after_cleanup(
    session: AsyncSession,
    user_id: int,
    panel_service: PanelApiService,
    *,
    now: Optional[datetime] = None,
) -> bool:
    """Rebuild Remnawave squads for one user after local cleanup.

    Best-effort: returns True on success (or nothing to do), False if Remnawave
    could not be updated (caller keeps going; the next cycle retries).
    """
    if now is None:
        now = datetime.now(timezone.utc)

    has_active_standalone = bool(
        await plan_entitlement_dal.get_active_standalone_entitlement(
            session, user_id, now=now
        )
    )

    if not has_active_standalone:
        # Standalone gone: Remnawave already expired the user via expireAt, so we
        # don't push a partial state. Expired subscription rows are already
        # excluded from active queries (end_date filter).
        logger.info(
            "reconcile_user_after_cleanup: no active standalone for user=%s; "
            "relying on Remnawave expireAt",
            user_id,
        )
        return True

    db_user = await user_dal.get_user_by_id(session, user_id)
    panel_user_id = db_user.panel_user_id if db_user else None
    if panel_user_id is None:
        logger.warning(
            "reconcile_user_after_cleanup: no panel_user_id for user=%s; skipping",
            user_id,
        )
        return True

    # Addon(s) expired but standalone remains: rebuild squads to drop the expired
    # addon squad. tariff_sync sends a single PATCH /users.
    try:
        return await sync_entitlements_to_panel(
            session, user_id, panel_user_id, panel_service, now=now
        )
    except Exception as e:  # noqa: BLE001 — Remnawave must never crash cleanup
        logger.error(
            "reconcile_user_after_cleanup: Remnawave error for user=%s: %s",
            user_id, e, exc_info=True,
        )
        return False


async def run_entitlement_cleanup(
    session: AsyncSession,
    panel_service: PanelApiService,
    *,
    now: Optional[datetime] = None,
) -> dict:
    """Full cleanup cycle: deactivate expired entitlements + reconcile panel state."""
    if now is None:
        now = datetime.now(timezone.utc)

    stats = await cleanup_expired_entitlements(session, now=now)
    affected_user_ids = stats.pop("affected_user_ids", set())
    await session.commit()

    reconciled = 0
    panel_failures = 0
    for user_id in affected_user_ids:
        try:
            ok = await reconcile_user_after_cleanup(
                session, user_id, panel_service, now=now
            )
            if ok:
                reconciled += 1
            else:
                panel_failures += 1
            await session.commit()
        except Exception as e:  # noqa: BLE001
            logger.error(
                "run_entitlement_cleanup: failed reconciling user=%s: %s",
                user_id, e, exc_info=True,
            )
            await session.rollback()
            panel_failures += 1

    stats["reconciled"] = reconciled
    stats["panel_failures"] = panel_failures
    logger.info("Entitlement cleanup finished: %s", stats)
    return stats
