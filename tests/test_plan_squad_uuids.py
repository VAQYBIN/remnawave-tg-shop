"""Несколько Internal Squad UUID на тариф: нормализация пары полей и сборка state."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from core.dal.pricing_plan_dal import _validate_legacy_enable, normalise_squad_fields
from core.services import tariff_sync
from web.routers.admin.plans import normalise_squad_input
from web.schemas.admin.plans import PricingPlanCreateRequest, PricingPlanResponse

NOW = datetime(2026, 7, 27, 12, 0, tzinfo=timezone.utc)


# ── DAL: remnawave_squad_uuid и remnawave_squad_uuids всегда согласованы ─────
def test_single_uuid_fills_list():
    """Бот пишет только одиночное поле — список должен подтянуться сам."""
    assert normalise_squad_fields({"remnawave_squad_uuid": "a"}) == {
        "remnawave_squad_uuid": "a",
        "remnawave_squad_uuids": ["a"],
    }


def test_list_fills_single_uuid_with_first_item():
    """Легаси-код (бот, tariff_bootstrap) читает одиночное поле."""
    assert normalise_squad_fields({"remnawave_squad_uuids": ["a", "b"]}) == {
        "remnawave_squad_uuid": "a",
        "remnawave_squad_uuids": ["a", "b"],
    }


def test_explicit_list_wins_over_single_uuid():
    result = normalise_squad_fields({"remnawave_squad_uuid": "z", "remnawave_squad_uuids": ["a", "b"]})
    assert result == {"remnawave_squad_uuid": "a", "remnawave_squad_uuids": ["a", "b"]}


def test_duplicates_and_blanks_are_dropped():
    result = normalise_squad_fields({"remnawave_squad_uuids": [" a ", "a", "", "b"]})
    assert result["remnawave_squad_uuids"] == ["a", "b"]


def test_clearing_squads_clears_both_fields():
    assert normalise_squad_fields({"remnawave_squad_uuid": None}) == {
        "remnawave_squad_uuid": None,
        "remnawave_squad_uuids": None,
    }


def test_unrelated_updates_are_untouched():
    values = {"name_ru": "Тариф", "is_enabled": True}
    assert normalise_squad_fields(values) == values


def test_legacy_enable_accepts_plan_with_only_list():
    plan = SimpleNamespace(remnawave_squad_uuid=None, remnawave_squad_uuids=["a"])
    _validate_legacy_enable(plan, 100, None)  # не должно бросать


# ── Сборка состояния панели ──────────────────────────────────────────────────
def make_plan(**overrides):
    base = dict(
        plan_kind="standalone",
        remnawave_squad_uuid=None,
        remnawave_squad_uuids=None,
        traffic_reset_strategy="NO_RESET",
        hwid_device_limit=None,
        is_trial=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_entitlement(plan):
    return SimpleNamespace(
        plan=plan,
        plan_option=SimpleNamespace(traffic_unlimited=True),
        ends_at=NOW + timedelta(days=30),
        traffic_limit_bytes_added=0,
    )


def build_state(monkeypatch, entitlements):
    async def _fake_active(_session, _user_id, now=None):
        return entitlements

    monkeypatch.setattr(
        tariff_sync.plan_entitlement_dal, "get_active_entitlements_for_user", _fake_active
    )
    return asyncio.run(tariff_sync.build_panel_state(None, 1, now=NOW))


def test_all_standalone_squads_are_sent(monkeypatch):
    state = build_state(monkeypatch, [make_entitlement(make_plan(remnawave_squad_uuids=["a", "b"]))])
    assert state["activeInternalSquads"] == ["a", "b"]


def test_falls_back_to_single_uuid(monkeypatch):
    state = build_state(monkeypatch, [make_entitlement(make_plan(remnawave_squad_uuid="a"))])
    assert state["activeInternalSquads"] == ["a"]


def test_addon_squads_are_appended_without_duplicates(monkeypatch):
    standalone = make_entitlement(make_plan(remnawave_squad_uuids=["a", "b"]))
    addon = make_entitlement(make_plan(plan_kind="addon", remnawave_squad_uuids=["b", "c"]))
    state = build_state(monkeypatch, [standalone, addon])
    assert state["activeInternalSquads"] == ["a", "b", "c"]


# ── Web-схемы и роутер ───────────────────────────────────────────────────────
def test_router_normalises_comma_separated_input():
    assert normalise_squad_input(["a", "b"], None) == ["a", "b"]
    assert normalise_squad_input(None, "a, b") == ["a", "b"]
    assert normalise_squad_input(["b"], "a") == ["b", "a"]
    assert normalise_squad_input(None, None) == []


def test_response_normalises_list_from_db():
    plan = SimpleNamespace(
        id=1, slug="s", name_ru="Т", name_en=None, description_ru=None, description_en=None,
        remnawave_squad_uuid="a", remnawave_squad_uuids=["a", "b"],
        remnawave_squad_name_snapshot=None, plan_kind="standalone", billing_model="time",
        traffic_reset_strategy="NO_RESET", min_price_rub=None, min_price_stars=None,
        hwid_device_limit=None, is_trial=False, is_enabled=True, is_archived=False,
        sort_order=0, created_at=NOW, updated_at=None, options=[],
    )
    assert PricingPlanResponse.model_validate(plan).remnawave_squad_uuids == ["a", "b"]


def test_response_falls_back_to_empty_list():
    plan = SimpleNamespace(
        id=1, slug="s", name_ru="Т", name_en=None, description_ru=None, description_en=None,
        remnawave_squad_uuid=None, remnawave_squad_uuids=None,
        remnawave_squad_name_snapshot=None, plan_kind="standalone", billing_model="time",
        traffic_reset_strategy="NO_RESET", min_price_rub=None, min_price_stars=None,
        hwid_device_limit=None, is_trial=False, is_enabled=True, is_archived=False,
        sort_order=0, created_at=NOW, updated_at=None, options=[],
    )
    assert PricingPlanResponse.model_validate(plan).remnawave_squad_uuids == []


def test_create_request_accepts_list():
    body = PricingPlanCreateRequest(name_ru="Т", remnawave_squad_uuids=["a", "b"])
    assert body.remnawave_squad_uuids == ["a", "b"]
