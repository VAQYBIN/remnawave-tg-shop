"""
Tariff sync — builds Remnawave user state from active entitlements and pushes via PATCH /users.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List

from config.settings import Settings

from sqlalchemy.ext.asyncio import AsyncSession

from core.dal import plan_entitlement_dal
from core.services.panel_client import PanelApiService

logger = logging.getLogger(__name__)


async def build_panel_state(
    session: AsyncSession,
    user_id: int,
    now: Optional[datetime] = None,
    settings: Optional[Settings] = None,
) -> Optional[dict]:
    """
    Build target Remnawave state from active entitlements.
    Returns None if no active standalone exists.
    Result keys: activeInternalSquads, expireAt, trafficLimitBytes, trafficLimitStrategy, status.
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

    # activeInternalSquads: all standalone squads first, then addon squads (no duplicates)
    squad_uuids: List[str] = []

    def add_plan_squads(plan) -> None:
        values = plan.remnawave_squad_uuids or ([plan.remnawave_squad_uuid] if plan.remnawave_squad_uuid else [])
        for uuid_val in values:
            if uuid_val and uuid_val not in squad_uuids:
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

    hwid_limit = standalone.plan.hwid_device_limit
    if hwid_limit is None and settings is not None:
        hwid_limit = settings.TRIAL_HWID_DEVICE_LIMIT if standalone.plan.is_trial else settings.USER_HWID_DEVICE_LIMIT

    expire_iso = expire_at.isoformat(timespec="milliseconds")
    if expire_iso.endswith("+00:00"):
        expire_iso = expire_iso[:-6] + "Z"
    elif not expire_iso.endswith("Z"):
        expire_iso += "Z"

    return {
        "activeInternalSquads": squad_uuids,
        "expireAt": expire_iso,
        "trafficLimitBytes": traffic_limit_bytes,
        "trafficLimitStrategy": strategy,
        "status": "ACTIVE",
        **({"hwidDeviceLimit": int(hwid_limit)} if hwid_limit is not None and int(hwid_limit) >= 0 else {}),
    }


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
    state = await build_panel_state(session, user_id, now=now, settings=panel_service.settings)
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
