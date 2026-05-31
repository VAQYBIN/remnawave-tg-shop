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


def make_option(option_id, plan, *, price_rub, price_stars=100, enabled=True):
    return PricingPlanOption(
        id=option_id,
        plan_id=plan.id,
        plan=plan,
        duration_months=1,
        price_rub=price_rub,
        price_stars=price_stars,
        is_enabled=enabled,
    )


def make_entitlement(
    entitlement_id,
    *,
    user_id,
    plan,
    option,
    starts_at,
    ends_at,
    auto_renew_enabled=True,
    active=True,
):
    return UserPlanEntitlement(
        id=entitlement_id,
        user_id=user_id,
        plan_id=plan.id,
        plan=plan,
        plan_option_id=option.id,
        plan_option=option,
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=active,
        auto_renew_enabled=auto_renew_enabled,
    )


@pytest.mark.asyncio
async def test_build_standalone_renewal_bundle_counts_only_enabled_addons(monkeypatch):
    from core.dal import plan_entitlement_dal
    from core.services import plan_purchase_policy
    from core.services.tariff_renewal_bundle import build_standalone_renewal_bundle

    now = datetime(2026, 5, 25, tzinfo=timezone.utc)
    user_id = 42

    standalone_plan = make_plan(1, kind="standalone")
    addon_plan = make_plan(2, kind="addon")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0, price_stars=100)
    enabled_addon_option = make_option(20, addon_plan, price_rub=50.0, price_stars=60)
    disabled_addon_option = make_option(21, addon_plan, price_rub=70.0, price_stars=80)

    standalone = make_entitlement(
        100,
        user_id=user_id,
        plan=standalone_plan,
        option=standalone_option,
        starts_at=now - timedelta(days=20),
        ends_at=now + timedelta(days=10),
    )
    enabled_addon = make_entitlement(
        200,
        user_id=user_id,
        plan=addon_plan,
        option=enabled_addon_option,
        starts_at=now - timedelta(days=5),
        ends_at=now + timedelta(days=10),
        auto_renew_enabled=True,
    )
    disabled_addon = make_entitlement(
        201,
        user_id=user_id,
        plan=addon_plan,
        option=disabled_addon_option,
        starts_at=now - timedelta(days=5),
        ends_at=now + timedelta(days=10),
        auto_renew_enabled=False,
    )

    async def fake_get_standalone(session, requested_user_id, now=None):
        assert requested_user_id == user_id
        return standalone

    async def fake_get_entitlements(session, requested_user_id, now=None):
        assert requested_user_id == user_id
        return [standalone, enabled_addon, disabled_addon]

    async def fake_can_purchase(session, user_ids, option, now=None):
        return True, None

    monkeypatch.setattr(plan_entitlement_dal, "get_active_standalone_entitlement", fake_get_standalone)
    monkeypatch.setattr(plan_entitlement_dal, "get_active_entitlements_for_user", fake_get_entitlements)
    monkeypatch.setattr(plan_purchase_policy, "can_purchase_plan_option", fake_can_purchase)

    bundle = await build_standalone_renewal_bundle(
        FakeSession(),
        user_id=user_id,
        standalone_option=standalone_option,
        now=now,
    )

    assert bundle is not None
    assert bundle["total_price_rub"] == 150.0
    assert bundle["total_price_stars"] == 160
    assert bundle["snapshot"]["standalone"]["entitlement_id"] == standalone.id
    assert [item["entitlement_id"] for item in bundle["snapshot"]["addons"]] == [enabled_addon.id]
    assert json.loads(bundle["snapshot_json"]) == bundle["snapshot"]


@pytest.mark.asyncio
async def test_create_web_payment_uses_bundle_for_manual_standalone_renewal(monkeypatch):
    from core.dal import account_dal, active_discount_dal, payment_dal, pricing_plan_dal
    from core.services import payment_core, plan_purchase_policy, tariff_renewal_bundle

    standalone_plan = make_plan(1, kind="standalone")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0, price_stars=100)
    snapshot_json = json.dumps({
        "standalone": {
            "entitlement_id": 100,
            "plan_id": 1,
            "option_id": 10,
            "price_rub": 100.0,
            "price_stars": 100,
        },
        "addons": [{
            "entitlement_id": 200,
            "plan_id": 2,
            "option_id": 20,
            "price_rub": 50.0,
            "price_stars": 60,
        }],
    })
    created_payloads = []
    provider_updates = []

    async def fake_create_payment_record(session, payload):
        created_payloads.append(payload)
        return Payment(payment_id=777, **payload)

    async def fake_update_provider(session, payment_db_id, provider_id, status, redirect_url=None):
        provider_updates.append((payment_db_id, provider_id, status, redirect_url))

    async def fake_provider_payment(*args, **kwargs):
        return "provider-777", "https://pay.example/777"

    async def fake_get_available_providers(db, settings):
        return ["yookassa"]

    async def fake_get_effective_user_id(db, account):
        return 42

    async def fake_get_plan_option(db, option_id):
        assert option_id == standalone_option.id
        return standalone_option

    async def fake_can_purchase(db, user_ids, opt):
        assert user_ids == [42]
        assert opt == standalone_option
        return True, None

    async def fake_get_active_discount(db, user_id):
        assert user_id == 42
        return None

    async def fake_build_bundle(*args, **kwargs):
        return {
            "snapshot_json": snapshot_json,
            "total_price_rub": 150.0,
            "total_price_stars": 160,
        }

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

    payment_id, redirect_url = await payment_core.create_web_payment(
        FakeSession(),
        SimpleNamespace(WEB_FRONTEND_URL="https://web.example"),
        account=SimpleNamespace(user_id=42),
        provider="yookassa",
        plan_option_id=standalone_option.id,
    )

    assert payment_id == 777
    assert redirect_url == "https://pay.example/777"
    assert created_payloads[0]["amount"] == 150.0
    assert created_payloads[0]["auto_renew_bundle_snapshot"] == snapshot_json
    assert created_payloads[0]["sale_mode"] == "standalone"
    assert provider_updates == [(777, "provider-777", "pending", "https://pay.example/777")]


@pytest.mark.asyncio
async def test_apply_bundle_addon_renewals_skips_disabled_addon(monkeypatch):
    from core.dal import entitlement_payment_dal, plan_entitlement_dal
    from core.services.tariff_renewal_bundle import apply_bundle_addon_renewals

    now = datetime(2026, 5, 25, tzinfo=timezone.utc)
    old_addon_end = now + timedelta(days=3)
    new_standalone_end = now + timedelta(days=33)

    addon_plan = make_plan(2, kind="addon")
    addon_option = make_option(20, addon_plan, price_rub=50.0)
    disabled_addon = make_entitlement(
        200,
        user_id=42,
        plan=addon_plan,
        option=addon_option,
        starts_at=now - timedelta(days=5),
        ends_at=old_addon_end,
        auto_renew_enabled=False,
    )
    standalone_plan = make_plan(1, kind="standalone")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0)
    new_standalone = make_entitlement(
        101,
        user_id=42,
        plan=standalone_plan,
        option=standalone_option,
        starts_at=now,
        ends_at=new_standalone_end,
    )
    payment = Payment(
        payment_id=900,
        user_id=42,
        amount=150.0,
        currency="RUB",
        status="succeeded",
        provider="yookassa",
        auto_renew_bundle_snapshot=json.dumps({
            "standalone": {"entitlement_id": 100, "plan_id": 1, "option_id": 10},
            "addons": [{"entitlement_id": disabled_addon.id, "plan_id": 2, "option_id": 20}],
        }),
    )
    created_links = []

    async def fake_get_entitlement(session, entitlement_id):
        assert entitlement_id == disabled_addon.id
        return disabled_addon

    async def fake_create_link(session, *, entitlement_id, payment_id, purpose):
        created_links.append((entitlement_id, payment_id, purpose))

    monkeypatch.setattr(plan_entitlement_dal, "get_entitlement_by_id", fake_get_entitlement)
    monkeypatch.setattr(entitlement_payment_dal, "create_link", fake_create_link)

    session = FakeSession()
    renewed = await apply_bundle_addon_renewals(
        session,
        payment=payment,
        new_standalone=new_standalone,
        now=now,
    )

    assert renewed == 0
    assert disabled_addon.ends_at == old_addon_end
    assert created_links == []
    assert session.flush_count == 1


@pytest.mark.asyncio
async def test_create_standalone_entitlement_is_idempotent_for_repeated_webhook(monkeypatch):
    from core.dal import entitlement_payment_dal, plan_entitlement_dal, pricing_plan_dal
    from core.services.tariff_activation import create_standalone_entitlement

    now = datetime(2026, 5, 25, tzinfo=timezone.utc)
    standalone_plan = make_plan(1, kind="standalone")
    standalone_option = make_option(10, standalone_plan, price_rub=100.0)
    existing_entitlement = make_entitlement(
        101,
        user_id=42,
        plan=standalone_plan,
        option=standalone_option,
        starts_at=now - timedelta(days=1),
        ends_at=now + timedelta(days=29),
    )
    existing_link = SimpleNamespace(entitlement_id=existing_entitlement.id)
    payment = Payment(
        payment_id=900,
        user_id=42,
        amount=100.0,
        currency="RUB",
        status="succeeded",
        provider="yookassa",
        pricing_plan_option_id=standalone_option.id,
    )

    async def fake_get_links(session, payment_id):
        assert payment_id == payment.payment_id
        return [existing_link]

    async def fake_get_entitlement(session, entitlement_id):
        assert entitlement_id == existing_entitlement.id
        return existing_entitlement

    async def fail_if_called(*args, **kwargs):
        raise AssertionError("Repeated webhook must return existing entitlement before mutating state")

    monkeypatch.setattr(entitlement_payment_dal, "get_links_for_payment", fake_get_links)
    monkeypatch.setattr(plan_entitlement_dal, "get_entitlement_by_id", fake_get_entitlement)
    monkeypatch.setattr(pricing_plan_dal, "get_plan_option_by_id", fail_if_called)
    monkeypatch.setattr(plan_entitlement_dal, "create_entitlement", fail_if_called)
    monkeypatch.setattr(plan_entitlement_dal, "deactivate_entitlement", fail_if_called)

    result = await create_standalone_entitlement(FakeSession(), payment=payment, now=now)

    assert result == {
        "end_date": existing_entitlement.ends_at,
        "entitlement_id": existing_entitlement.id,
        "traffic_bytes": existing_entitlement.traffic_limit_bytes_added,
        "already_done": True,
    }
