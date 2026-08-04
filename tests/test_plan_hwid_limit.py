"""Лимит устройств (hwidDeviceLimit): на тариф, с fallback на .env."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from core.services import tariff_sync, trial_core
from web.routers.admin.plans import build_plan_updates
from web.schemas.admin.plans import PricingPlanUpdateRequest

NOW = datetime(2026, 7, 27, 12, 0, tzinfo=timezone.utc)


def make_plan(**overrides):
    base = dict(
        plan_kind="standalone",
        remnawave_squad_uuid="squad-1",
        traffic_reset_strategy="NO_RESET",
        hwid_device_limit=None,
        is_trial=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_entitlement(plan, **overrides):
    base = dict(
        plan=plan,
        plan_option=SimpleNamespace(traffic_unlimited=True),
        ends_at=NOW + timedelta(days=30),
        traffic_limit_bytes_added=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_settings(**overrides):
    base = dict(USER_HWID_DEVICE_LIMIT=None, TRIAL_HWID_DEVICE_LIMIT=None)
    base.update(overrides)
    return SimpleNamespace(**base)


def build_state(monkeypatch, entitlements, settings=None):
    async def _fake_active(_session, _user_id, now=None):
        return entitlements

    monkeypatch.setattr(
        tariff_sync.plan_entitlement_dal,
        "get_active_entitlements_for_user",
        _fake_active,
    )
    return asyncio.run(tariff_sync.build_panel_state(None, 1, now=NOW, settings=settings))


def test_plan_limit_wins_over_env(monkeypatch):
    state = build_state(
        monkeypatch,
        [make_entitlement(make_plan(hwid_device_limit=5))],
        make_settings(USER_HWID_DEVICE_LIMIT=2),
    )
    assert state["hwidDeviceLimit"] == 5


def test_env_limit_used_when_plan_has_none(monkeypatch):
    state = build_state(
        monkeypatch,
        [make_entitlement(make_plan())],
        make_settings(USER_HWID_DEVICE_LIMIT=3),
    )
    assert state["hwidDeviceLimit"] == 3


def test_trial_plan_uses_trial_env_limit(monkeypatch):
    state = build_state(
        monkeypatch,
        [make_entitlement(make_plan(is_trial=True))],
        make_settings(USER_HWID_DEVICE_LIMIT=5, TRIAL_HWID_DEVICE_LIMIT=1),
    )
    assert state["hwidDeviceLimit"] == 1


def test_zero_limit_is_sent_as_unlimited(monkeypatch):
    """0 — валидное значение Remnawave («без лимита»), а не «не задано»."""
    state = build_state(
        monkeypatch,
        [make_entitlement(make_plan(hwid_device_limit=0))],
        make_settings(USER_HWID_DEVICE_LIMIT=4),
    )
    assert state["hwidDeviceLimit"] == 0


def test_key_absent_when_nothing_configured(monkeypatch):
    """Ключ не отправляем вовсе — иначе перетрём значение, выставленное в панели."""
    state = build_state(monkeypatch, [make_entitlement(make_plan())], make_settings())
    assert "hwidDeviceLimit" not in state


def test_key_absent_without_settings(monkeypatch):
    """Вызов без settings (старый контракт) не должен падать."""
    state = build_state(monkeypatch, [make_entitlement(make_plan())])
    assert "hwidDeviceLimit" not in state


def test_negative_limit_is_ignored(monkeypatch):
    state = build_state(
        monkeypatch,
        [make_entitlement(make_plan(hwid_device_limit=-1))],
        make_settings(),
    )
    assert "hwidDeviceLimit" not in state


def test_addon_plan_limit_does_not_override_standalone(monkeypatch):
    standalone = make_entitlement(make_plan(hwid_device_limit=2))
    addon = make_entitlement(
        make_plan(plan_kind="addon", remnawave_squad_uuid="squad-2", hwid_device_limit=9)
    )
    state = build_state(monkeypatch, [standalone, addon], make_settings())
    assert state["hwidDeviceLimit"] == 2


def test_plan_patch_sets_limit():
    updates = build_plan_updates(PricingPlanUpdateRequest(hwid_device_limit=3))
    assert updates["hwid_device_limit"] == 3


def test_plan_patch_can_reset_limit_to_env_default():
    """Явный null = «наследовать из .env», exclude_none такое бы потерял."""
    updates = build_plan_updates(PricingPlanUpdateRequest(hwid_device_limit=None))
    assert "hwid_device_limit" in updates
    assert updates["hwid_device_limit"] is None


def test_plan_patch_without_field_does_not_touch_limit():
    updates = build_plan_updates(PricingPlanUpdateRequest(name_ru="Тариф"))
    assert "hwid_device_limit" not in updates


def test_plan_patch_rejects_negative_limit():
    with pytest.raises(ValidationError):
        PricingPlanUpdateRequest(hwid_device_limit=-1)


def make_trial_settings(**overrides):
    base = dict(
        USER_TRAFFIC_STRATEGY="NO_RESET",
        parsed_user_squad_uuids=None,
        parsed_user_external_squad_uuid=None,
        USER_HWID_DEVICE_LIMIT=None,
        TRIAL_HWID_DEVICE_LIMIT=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def trial_payload(settings):
    return trial_core._build_panel_update_payload(
        settings,
        expire_at=NOW + timedelta(days=3),
        traffic_limit_bytes=0,
        description="trial",
    )


def test_trial_payload_uses_trial_limit():
    payload = trial_payload(make_trial_settings(TRIAL_HWID_DEVICE_LIMIT=1, USER_HWID_DEVICE_LIMIT=5))
    assert payload["hwidDeviceLimit"] == 1


def test_trial_payload_falls_back_to_user_limit():
    payload = trial_payload(make_trial_settings(USER_HWID_DEVICE_LIMIT=5))
    assert payload["hwidDeviceLimit"] == 5


def test_trial_payload_omits_limit_when_unset():
    assert "hwidDeviceLimit" not in trial_payload(make_trial_settings())


@pytest.mark.asyncio
async def test_sync_passes_panel_settings(monkeypatch):
    """sync_entitlements_to_panel берёт настройки из panel_service."""
    captured = {}

    async def _fake_build(_session, _user_id, now=None, settings=None):
        captured["settings"] = settings
        return {"activeInternalSquads": [], "expireAt": "x", "trafficLimitBytes": 0,
                "trafficLimitStrategy": "NO_RESET", "status": "ACTIVE"}

    async def _fake_update(_uuid, payload):
        captured["payload"] = payload
        return {"ok": True}

    monkeypatch.setattr(tariff_sync, "build_panel_state", _fake_build)
    panel_settings = make_settings(USER_HWID_DEVICE_LIMIT=7)
    panel = SimpleNamespace(settings=panel_settings, update_user_details_on_panel=_fake_update)

    assert await tariff_sync.sync_entitlements_to_panel(None, 1, "uuid-1", panel) is True
    assert captured["settings"] is panel_settings
