"""Combined "standalone + new addon" purchase flow (web dashboard).

Covers pricing in create_web_payment (full-price addon bundled into the standalone
payment), snapshot construction, request validation, and activation creating the addon
entitlement aligned to the new standalone end.
"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from db.models import Payment, PricingPlan, PricingPlanOption, UserPlanEntitlement


class FakeSession:
    def __init__(self):
        self.flush_count = 0

    async def flush(self):
        self.flush_count += 1


def make_plan(plan_id, *, kind, enabled=True, archived=False):
    return PricingPlan(
        id=plan_id,
        slug=f"{kind}-{plan_id}",
        name_ru=f"{kind} {plan_id}",
        plan_kind=kind,
        billing_model="time",
        traffic_reset_strategy="NO_RESET",
        is_enabled=enabled,
        is_archived=archived,
    )


def make_option(option_id, plan, *, price_rub, price_stars=100, enabled=True, traffic_gb=None):
    return PricingPlanOption(
        id=option_id,
        plan_id=plan.id,
        plan=plan,
        duration_months=1,
        price_rub=price_rub,
        price_stars=price_stars,
        is_enabled=enabled,
        traffic_gb=traffic_gb,
    )


# ── Helper unit ──────────────────────────────────────────────────────────────

def test_add_new_addon_to_snapshot_builds_minimal_base_when_no_bundle():
    from core.services.tariff_renewal_bundle import add_new_addon_to_snapshot

    standalone_plan = make_plan(1, kind="standalone")
    addon_plan = make_plan(2, kind="addon")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0, price_stars=100)
    addon_option = make_option(20, addon_plan, price_rub=50.0, price_stars=60)

    res = add_new_addon_to_snapshot(
        None,
        standalone_option=standalone_option,
        addon_option=addon_option,
    )

    assert res["addon_price_rub"] == 50.0
    assert res["addon_price_stars"] == 60
    snap = res["snapshot"]
    assert snap["standalone"]["option_id"] == 10
    assert snap["addons"] == []
    assert snap["new_addons"] == [{
        "plan_id": 2,
        "option_id": 20,
        "price_rub": 50.0,
        "price_stars": 60,
    }]
    assert json.loads(res["snapshot_json"]) == snap


def test_add_new_addon_to_snapshot_augments_existing_renewal_bundle():
    from core.services.tariff_renewal_bundle import add_new_addon_to_snapshot

    standalone_plan = make_plan(1, kind="standalone")
    addon_plan = make_plan(2, kind="addon")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0)
    addon_option = make_option(20, addon_plan, price_rub=50.0, price_stars=60)

    existing = {
        "standalone": {"entitlement_id": 100, "plan_id": 1, "option_id": 10},
        "addons": [{"entitlement_id": 200, "plan_id": 2, "option_id": 21}],
    }
    res = add_new_addon_to_snapshot(
        existing,
        standalone_option=standalone_option,
        addon_option=addon_option,
    )

    # existing renewal addons preserved, new addon added separately
    assert res["snapshot"]["addons"] == [{"entitlement_id": 200, "plan_id": 2, "option_id": 21}]
    assert res["snapshot"]["new_addons"][0]["option_id"] == 20


# ── Pricing in create_web_payment ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_web_payment_bundles_new_addon_at_full_price(monkeypatch):
    from core.dal import account_dal, active_discount_dal, payment_dal, pricing_plan_dal
    from core.services import payment_core, plan_purchase_policy, tariff_renewal_bundle

    standalone_plan = make_plan(1, kind="standalone")
    addon_plan = make_plan(2, kind="addon")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0, price_stars=100)
    addon_option = make_option(20, addon_plan, price_rub=50.0, price_stars=60, traffic_gb=100)

    created_payloads = []

    async def fake_create_payment_record(session, payload):
        created_payloads.append(payload)
        return Payment(payment_id=777, **payload)

    async def fake_update_provider(session, payment_db_id, provider_id, status, redirect_url=None):
        pass

    async def fake_provider_payment(*args, **kwargs):
        return "provider-777", "https://pay.example/777"

    async def fake_get_available_providers(db, settings):
        return ["yookassa"]

    async def fake_get_effective_user_id(db, account):
        return 42

    async def fake_get_plan_option(db, option_id):
        return {10: standalone_option, 20: addon_option}[option_id]

    async def fake_can_purchase(db, user_ids, opt):
        return True, None

    async def fake_get_active_discount(db, user_id):
        return None

    async def fake_build_bundle(*args, **kwargs):
        # New user: no auto-renew addons to bundle
        return None

    monkeypatch.setattr(payment_core, "get_available_providers_db", fake_get_available_providers)
    monkeypatch.setattr(account_dal, "get_effective_payment_user_id", fake_get_effective_user_id)
    monkeypatch.setattr(account_dal, "get_account_user_ids", lambda account: [42])
    monkeypatch.setattr(pricing_plan_dal, "get_plan_option_by_id", fake_get_plan_option)
    monkeypatch.setattr(plan_purchase_policy, "can_purchase_plan_option", fake_can_purchase)
    monkeypatch.setattr(active_discount_dal, "get_active_discount", fake_get_active_discount)
    monkeypatch.setattr(tariff_renewal_bundle, "build_standalone_renewal_bundle", fake_build_bundle)
    monkeypatch.setattr(payment_dal, "create_payment_record", fake_create_payment_record)
    monkeypatch.setattr(payment_dal, "update_provider_payment_and_status", fake_update_provider)
    monkeypatch.setattr(payment_core, "_create_yookassa_payment", fake_provider_payment)

    payment_id, _ = await payment_core.create_web_payment(
        FakeSession(),
        SimpleNamespace(WEB_FRONTEND_URL="https://web.example"),
        account=SimpleNamespace(user_id=42),
        provider="yookassa",
        plan_option_id=standalone_option.id,
        addon_option_id=addon_option.id,
    )

    assert payment_id == 777
    payload = created_payloads[0]
    assert payload["amount"] == 150.0  # 100 standalone + 50 addon (full price)
    assert payload["sale_mode"] == "standalone"
    snapshot = json.loads(payload["auto_renew_bundle_snapshot"])
    assert snapshot["new_addons"][0]["option_id"] == 20
    assert snapshot["new_addons"][0]["price_rub"] == 50.0


@pytest.mark.asyncio
async def test_create_web_payment_rejects_addon_with_legacy_months(monkeypatch):
    from core.dal import account_dal
    from core.services import payment_core

    async def fake_get_available_providers(db, settings):
        return ["yookassa"]

    async def fake_get_effective_user_id(db, account):
        return 42

    monkeypatch.setattr(payment_core, "get_available_providers_db", fake_get_available_providers)
    monkeypatch.setattr(account_dal, "get_effective_payment_user_id", fake_get_effective_user_id)

    with pytest.raises(ValueError):
        await payment_core.create_web_payment(
            FakeSession(),
            SimpleNamespace(WEB_FRONTEND_URL="https://web.example"),
            account=SimpleNamespace(user_id=42),
            provider="yookassa",
            months=1,
            addon_option_id=20,
        )


@pytest.mark.asyncio
async def test_create_web_payment_rejects_addon_added_to_addon(monkeypatch):
    from core.dal import account_dal, pricing_plan_dal
    from core.services import payment_core, plan_purchase_policy

    addon_plan = make_plan(2, kind="addon")
    addon_option = make_option(20, addon_plan, price_rub=50.0)

    async def fake_get_available_providers(db, settings):
        return ["yookassa"]

    async def fake_get_effective_user_id(db, account):
        return 42

    async def fake_get_plan_option(db, option_id):
        return addon_option

    async def fake_can_purchase(db, user_ids, opt):
        return True, None

    monkeypatch.setattr(payment_core, "get_available_providers_db", fake_get_available_providers)
    monkeypatch.setattr(account_dal, "get_effective_payment_user_id", fake_get_effective_user_id)
    monkeypatch.setattr(account_dal, "get_account_user_ids", lambda account: [42])
    monkeypatch.setattr(pricing_plan_dal, "get_plan_option_by_id", fake_get_plan_option)
    monkeypatch.setattr(plan_purchase_policy, "can_purchase_plan_option", fake_can_purchase)

    with pytest.raises(ValueError):
        await payment_core.create_web_payment(
            FakeSession(),
            SimpleNamespace(WEB_FRONTEND_URL="https://web.example"),
            account=SimpleNamespace(user_id=42),
            provider="yookassa",
            plan_option_id=addon_option.id,
            addon_option_id=99,
        )


# ── Activation ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_standalone_entitlement_creates_bundled_addon(monkeypatch):
    from core.dal import entitlement_payment_dal, plan_entitlement_dal, pricing_plan_dal
    from core.services.tariff_activation import create_standalone_entitlement

    now = datetime(2026, 5, 25, tzinfo=timezone.utc)
    standalone_plan = make_plan(1, kind="standalone")
    addon_plan = make_plan(2, kind="addon")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0)
    addon_option = make_option(20, addon_plan, price_rub=50.0, traffic_gb=100)

    payment = Payment(
        payment_id=900,
        user_id=42,
        amount=150.0,
        currency="RUB",
        status="succeeded",
        provider="yookassa",
        pricing_plan_option_id=standalone_option.id,
        auto_renew_bundle_snapshot=json.dumps({
            "standalone": {"plan_id": 1, "option_id": 10, "price_rub": 100.0, "price_stars": 100},
            "addons": [],
            "new_addons": [{"plan_id": 2, "option_id": 20, "price_rub": 50.0, "price_stars": 60}],
        }),
    )

    created_entitlements = []
    created_links = []
    counter = {"n": 0}

    async def fake_get_links(session, payment_id):
        return []  # first webhook delivery

    async def fake_get_active_standalone(session, user_id, now=None):
        return None  # brand-new user

    async def fake_get_plan_option(session, option_id):
        return {10: standalone_option, 20: addon_option}[option_id]

    async def fake_create_entitlement(session, **kwargs):
        counter["n"] += 1
        ent = UserPlanEntitlement(id=500 + counter["n"], **kwargs)
        created_entitlements.append(ent)
        return ent

    async def fake_create_link(session, *, entitlement_id, payment_id, purpose):
        created_links.append((entitlement_id, purpose))

    monkeypatch.setattr(entitlement_payment_dal, "get_links_for_payment", fake_get_links)
    monkeypatch.setattr(entitlement_payment_dal, "create_link", fake_create_link)
    monkeypatch.setattr(plan_entitlement_dal, "get_active_standalone_entitlement", fake_get_active_standalone)
    monkeypatch.setattr(plan_entitlement_dal, "create_entitlement", fake_create_entitlement)
    monkeypatch.setattr(pricing_plan_dal, "get_plan_option_by_id", fake_get_plan_option)

    result = await create_standalone_entitlement(FakeSession(), payment=payment, now=now)

    # standalone + addon entitlements both created
    assert len(created_entitlements) == 2
    standalone_ent, addon_ent = created_entitlements
    assert standalone_ent.plan_id == 1
    assert addon_ent.plan_id == 2
    assert addon_ent.plan_option_id == 20
    # addon period aligned to the new standalone end
    assert addon_ent.ends_at == standalone_ent.ends_at
    # addon traffic granted (100 GB)
    assert addon_ent.traffic_limit_bytes_added == 100 * (1024 ** 3)
    # both linked to the same payment
    assert len(created_links) == 2
    assert result["entitlement_id"] == standalone_ent.id
    assert payment.activation_status == "succeeded"
