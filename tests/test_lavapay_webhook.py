"""Вебхук LavaPay в боте: подпись обязательна, сумма сверяется, обработка идемпотентна."""
import hashlib
import hmac
import json
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import make_mocked_request

from bot.services.lavapay_service import LavaPayService

WEBHOOK_SECRET = "additional-key"
PAYMENT_ID = 77


def make_settings(**overrides):
    base = dict(
        LAVAPAY_ENABLED=True,
        LAVAPAY_SHOP_ID="shop",
        LAVAPAY_SECRET_KEY="secret",
        LAVAPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
        LAVAPAY_BASE_URL="https://api.lava.ru",
        LAVAPAY_RETURN_URL=None,
        LAVAPAY_FAIL_URL=None,
        LAVAPAY_EXPIRE_MINUTES=None,
        WEBHOOK_BASE_URL="https://hook.example.com",
        DEFAULT_LANGUAGE="ru",
        traffic_sale_mode=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeSession:
    def __init__(self, state):
        self.state = state

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def commit(self):
        self.state["commits"] += 1

    async def rollback(self):
        self.state["rollbacks"] += 1


def make_payment(**overrides):
    base = dict(
        payment_id=PAYMENT_ID,
        user_id=1,
        amount=150.0,
        currency="RUB",
        status="pending_lavapay",
        provider="lavapay",
        subscription_duration_months=1,
        promo_code_id=None,
        sale_mode=None,
        user=SimpleNamespace(language_code="ru", username="tester"),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture
def service(monkeypatch):
    """LavaPayService с замоканными DAL и уведомлениями."""
    state = {"commits": 0, "rollbacks": 0, "activated": [], "statuses": [], "marked": 0, "notified": 0}
    payment = make_payment()

    import bot.services.lavapay_service as module

    async def fake_get_payment(_session, payment_db_id):
        return payment if payment_db_id == PAYMENT_ID else None

    async def fake_mark_once(_session, payment_id, provider_id):
        state["marked"] += 1
        state["provider_id"] = provider_id
        return True

    async def fake_update_status(_session, payment_id, provider_id, status):
        state["statuses"].append(status)
        return True

    monkeypatch.setattr(module.payment_dal, "get_payment_by_db_id", fake_get_payment)
    monkeypatch.setattr(module.payment_dal, "mark_provider_payment_succeeded_once", fake_mark_once)
    monkeypatch.setattr(module.payment_dal, "update_provider_payment_and_status", fake_update_status)

    async def fake_activate(*args, **kwargs):
        state["activated"].append(kwargs.get("provider"))
        return {"end_date": None, "subscription_url": None}

    async def fake_referral(*args, **kwargs):
        return None

    async def fake_notify(*args, **kwargs):
        state["notified"] += 1

    svc = LavaPayService(
        bot=SimpleNamespace(send_message=fake_notify),
        settings=make_settings(),
        i18n=None,
        async_session_factory=lambda: FakeSession(state),
        subscription_service=SimpleNamespace(activate_subscription=fake_activate),
        referral_service=SimpleNamespace(apply_referral_bonuses_for_payment=fake_referral),
        default_return_url="testbot",
    )
    monkeypatch.setattr(svc, "_notify_success", fake_notify)
    svc._state = state
    svc._payment = payment
    return svc


def build_request(body: dict, signature: str | None = None, header: str = "Authorization"):
    raw = json.dumps(body).encode()
    if signature is None:
        signature = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    headers = {header: signature} if signature else {}
    request = make_mocked_request("POST", "/webhook/lavapay", headers=headers, payload=raw)

    async def _read():
        return raw

    request.read = _read
    return request


async def call(service, body, **kwargs) -> web.Response:
    return await service.webhook_route(build_request(body, **kwargs))


SUCCESS_BODY = {"invoice_id": "inv-1", "order_id": str(PAYMENT_ID), "status": "success", "amount": 150.0}


@pytest.mark.asyncio
async def test_valid_signature_activates_subscription(service):
    response = await call(service, SUCCESS_BODY)
    assert response.status == 200
    assert service._state["activated"] == ["lavapay"]


@pytest.mark.asyncio
async def test_missing_signature_is_rejected(service):
    response = await call(service, SUCCESS_BODY, signature="")
    assert response.status == 403
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_forged_signature_is_rejected(service):
    """Главный сценарий атаки: чужой POST с известным order_id."""
    response = await call(service, SUCCESS_BODY, signature="deadbeef")
    assert response.status == 403
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_signature_accepted_from_legacy_header(service):
    raw = json.dumps(SUCCESS_BODY).encode()
    sig = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    response = await call(service, SUCCESS_BODY, signature=sig, header="Signature")
    assert response.status == 200


@pytest.mark.asyncio
async def test_service_without_webhook_secret_returns_503(monkeypatch, service):
    service.settings = make_settings(LAVAPAY_WEBHOOK_SECRET=None)
    service.configured = False
    response = await call(service, SUCCESS_BODY)
    assert response.status == 503
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_amount_mismatch_does_not_activate(service):
    response = await call(service, {**SUCCESS_BODY, "amount": 10.0})
    assert response.status == 400
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_missing_amount_does_not_activate(service):
    body = {k: v for k, v in SUCCESS_BODY.items() if k != "amount"}
    response = await call(service, body)
    assert response.status == 400
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_already_succeeded_payment_is_not_reactivated(service):
    service._payment.status = "succeeded"
    response = await call(service, SUCCESS_BODY)
    assert response.status == 200
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_payment_of_another_provider_is_rejected(service):
    service._payment.provider = "yookassa"
    response = await call(service, SUCCESS_BODY)
    assert response.status == 400
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_unknown_payment_returns_404(service):
    response = await call(service, {**SUCCESS_BODY, "order_id": "999999"})
    assert response.status == 404


@pytest.mark.asyncio
async def test_failed_status_marks_payment_failed(service):
    response = await call(service, {**SUCCESS_BODY, "status": "cancel"})
    assert response.status == 200
    assert service._state["statuses"] == ["failed"]
    assert service._state["activated"] == []


@pytest.mark.asyncio
async def test_pending_status_keeps_payment_pending(service):
    response = await call(service, {**SUCCESS_BODY, "status": "created"})
    assert response.status == 200
    assert service._state["statuses"] == ["pending_lavapay"]
    assert service._state["activated"] == []
