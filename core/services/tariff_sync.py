"""
Tariff sync — builds Remnawave user state from active entitlements and pushes via PATCH /users.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal import plan_entitlement_dal
from core.dal.pricing_plan_dal import plan_squad_uuids
from core.services.panel_client import PanelApiService

logger = logging.getLogger(__name__)


def _resolve_hwid_limit(plan, settings: Optional[Settings]) -> Optional[int]:
    """Per-plan device limit, falling back to the .env default for its kind.

    Returns None when nothing is configured — the key is then omitted from the
    payload so a limit set directly in the panel is not overwritten.
    """
    limit = getattr(plan, "hwid_device_limit", None)
    if limit is None and settings is not None:
        limit = (
            settings.TRIAL_HWID_DEVICE_LIMIT
            if getattr(plan, "is_trial", False)
            else settings.USER_HWID_DEVICE_LIMIT
        )
    if limit is None:
        return None
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        logger.warning("build_panel_state: invalid hwid_device_limit %r; ignoring", limit)
        return None
    return limit if limit >= 0 else None


async def build_panel_state(
    session: AsyncSession,
    user_id: int,
    now: Optional[datetime] = None,
    settings: Optional[Settings] = None,
) -> Optional[dict]:
    """
    Build target Remnawave state from active entitlements.
    Returns None if no active standalone exists.
    Result keys: activeInternalSquads, expireAt, trafficLimitBytes, trafficLimitStrategy,
    status, and hwidDeviceLimit when a device limit is configured.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    entitlements = await plan_entitlement_dal.get_active_entitlements_for_user(
        session, user_id, now=now
    )

    standalone = None
    addons: List = []
    for e in entitlements:
        if e.plan and e.plan.plan_kind == "standalone":
            standalone = e
        elif e.plan and e.plan.plan_kind == "addon":
            addons.append(e)

    if not standalone:
        logger.debug("build_panel_state: no active standalone for user %s", user_id)
        return None

    # activeInternalSquads: all standalone squads first, then addons (no duplicates)
    squad_uuids: List[str] = []

    def add_plan_squads(plan) -> None:
        for uuid_val in plan_squad_uuids(plan):
            if uuid_val not in squad_uuids:
                squad_uuids.append(uuid_val)

    add_plan_squads(standalone.plan)
    for addon in addons:
        if addon.plan:
            add_plan_squads(addon.plan)

    expire_at = standalone.ends_at
    if expire_at is None:
        logger.error("build_panel_state: standalone has no ends_at for user %s", user_id)
        return None

    # Traffic: 0 (unlimited) if standalone option is explicit unlimited; else sum entitlements
    standalone_opt = standalone.plan_option
    is_explicit_unlimited = bool(standalone_opt and standalone_opt.traffic_unlimited)

    if is_explicit_unlimited:
        traffic_limit_bytes = 0  # Remnawave: 0 = unlimited
    else:
        traffic_limit_bytes = sum(
            (e.traffic_limit_bytes_added or 0) for e in [standalone] + addons
        )

    strategy = (standalone.plan.traffic_reset_strategy or "NO_RESET").upper()

    expire_iso = expire_at.isoformat(timespec="milliseconds")
    if expire_iso.endswith("+00:00"):
        expire_iso = expire_iso[:-6] + "Z"
    elif not expire_iso.endswith("Z"):
        expire_iso += "Z"

    state = {
        "activeInternalSquads": squad_uuids,
        "expireAt": expire_iso,
        "trafficLimitBytes": traffic_limit_bytes,
        "trafficLimitStrategy": strategy,
        "status": "ACTIVE",
    }

    hwid_limit = _resolve_hwid_limit(standalone.plan, settings)
    if hwid_limit is not None:
        state["hwidDeviceLimit"] = hwid_limit

    return state


async def sync_entitlements_to_panel(
    session: AsyncSession,
    user_id: int,
    panel_user_uuid: str,
    panel_service: PanelApiService,
    now: Optional[datetime] = None,
) -> bool:
    """
    Build state from active entitlements and push to Remnawave via single PATCH /users.
    Returns True if Remnawave accepted the update, False otherwise.
    """
    state = await build_panel_state(
        session, user_id, now=now, settings=getattr(panel_service, "settings", None)
    )
    if state is None:
        logger.warning(
            "sync_entitlements_to_panel: no standalone for user %s; skipping Remnawave sync",
            user_id,
        )
        return False

    payload = {"uuid": panel_user_uuid, **state}
    result = await panel_service.update_user_details_on_panel(panel_user_uuid, payload)
    if result is None:
        logger.error(
            "sync_entitlements_to_panel: Remnawave PATCH failed for user=%s uuid=%s",
            user_id, panel_user_uuid,
        )
        return False

    logger.info(
        "sync_entitlements_to_panel: OK user=%s squads=%s expire=%s traffic=%s",
        user_id,
        state["activeInternalSquads"],
        state["expireAt"],
        state["trafficLimitBytes"],
    )
    return True
