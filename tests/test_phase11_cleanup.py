import pytest
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from core.services import tariff_cleanup


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
PAST = NOW - timedelta(days=1)
FUTURE = NOW + timedelta(days=10)


def _plan(plan_id, kind="standalone", squad="squad-uuid"):
    return SimpleNamespace(
        id=plan_id,
        plan_kind=kind,
        remnawave_squad_uuid=squad,
        traffic_reset_strategy="NO_RESET",
    )


def _ent(ent_id, user_id, plan, ends_at, option=None):
    return SimpleNamespace(
        id=ent_id,
        user_id=user_id,
        plan=plan,
        plan_id=plan.id,
        plan_option=option,
        ends_at=ends_at,
        is_active=True,
        traffic_limit_bytes_added=0,
    )


def _patch_dal(expired, per_user):
    """Build a mock plan_entitlement_dal.

    expired: list returned by get_expired_active_entitlements
    per_user: dict user_id -> list returned by get_all_active_entitlements_for_user
    """
    dal = MagicMock()
    dal.get_expired_active_entitlements = AsyncMock(return_value=expired)
    dal.get_all_active_entitlements_for_user = AsyncMock(
        side_effect=lambda session, uid: per_user[uid]
    )
    dal.deactivate_entitlement = AsyncMock()
    return dal


@pytest.mark.asyncio
async def test_addon_expiry_while_standalone_active():
    sa = _ent(1, 100, _plan(1, "standalone"), FUTURE)
    addon = _ent(2, 100, _plan(2, "addon", squad="addon-squad"), PAST)
    dal = _patch_dal([addon], {100: [sa, addon]})

    session = MagicMock()
    session.flush = AsyncMock()

    with patch.object(tariff_cleanup, "plan_entitlement_dal", dal):
        stats = await tariff_cleanup.cleanup_expired_entitlements(session, now=NOW)

    assert stats["addon_deactivated"] == 1
    assert stats["standalone_deactivated"] == 0
    dal.deactivate_entitlement.assert_awaited_once()
    _, kwargs = dal.deactivate_entitlement.await_args
    assert kwargs["reason"] == "expired"


@pytest.mark.asyncio
async def test_standalone_expiry_cascades_to_addons():
    sa = _ent(1, 200, _plan(1, "standalone"), PAST)
    addon = _ent(2, 200, _plan(2, "addon"), FUTURE)  # future, but cascades anyway
    dal = _patch_dal([sa], {200: [sa, addon]})

    session = MagicMock()
    session.flush = AsyncMock()

    with patch.object(tariff_cleanup, "plan_entitlement_dal", dal):
        stats = await tariff_cleanup.cleanup_expired_entitlements(session, now=NOW)

    assert stats["standalone_deactivated"] == 1
    assert stats["addon_deactivated"] == 1
    reasons = {c.kwargs["reason"] for c in dal.deactivate_entitlement.await_args_list}
    assert reasons == {"expired", "standalone_expired"}


@pytest.mark.asyncio
async def test_orphan_addon_without_standalone():
    addon = _ent(2, 300, _plan(2, "addon"), PAST)
    dal = _patch_dal([addon], {300: [addon]})  # no standalone present

    session = MagicMock()
    session.flush = AsyncMock()

    with patch.object(tariff_cleanup, "plan_entitlement_dal", dal):
        stats = await tariff_cleanup.cleanup_expired_entitlements(session, now=NOW)

    assert stats["addon_deactivated"] == 1
    _, kwargs = dal.deactivate_entitlement.await_args
    assert kwargs["reason"] == "standalone_expired"


@pytest.mark.asyncio
async def test_run_cleanup_survives_remnawave_unavailable():
    sa = _ent(1, 400, _plan(1, "standalone"), FUTURE)
    addon = _ent(2, 400, _plan(2, "addon", squad="addon-squad"), PAST)
    dal = _patch_dal([addon], {400: [sa, addon]})
    # active standalone lookup used by reconcile
    dal.get_active_standalone_entitlement = AsyncMock(return_value=sa)

    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    panel_service = MagicMock()

    user_dal = MagicMock()
    user_dal.get_user_by_id = AsyncMock(
        return_value=SimpleNamespace(panel_user_uuid="panel-uuid")
    )

    # standalone still active -> sync attempted -> Remnawave raises -> caught
    with patch.object(tariff_cleanup, "plan_entitlement_dal", dal), \
         patch.object(tariff_cleanup, "user_dal", user_dal), \
         patch.object(
             tariff_cleanup, "sync_entitlements_to_panel",
             AsyncMock(side_effect=RuntimeError("Remnawave down")),
         ):
        stats = await tariff_cleanup.run_entitlement_cleanup(
            session, panel_service, now=NOW
        )

    # Local deactivation committed; panel failure recorded, no crash.
    assert stats["addon_deactivated"] == 1
    assert stats["panel_failures"] == 1
    assert stats["reconciled"] == 0
