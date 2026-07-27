"""LavaPay (Lava Business API): подпись запросов и верификация вебхука.

Контракт (dev.lava.ru / api.lava.ru):
* исходящий запрос — Signature: HMAC-SHA256(raw_body, secret_key) hex;
* вебхук — Authorization: HMAC-SHA256(raw_body | canonical JSON, webhook_secret) hex.
"""
import hashlib
import hmac
import json
from types import SimpleNamespace

import httpx
import pytest

from core.services import lava_client

SECRET = "shop-secret-key"
WEBHOOK_SECRET = "shop-additional-key"


def make_settings(**overrides):
    base = dict(
        LAVAPAY_ENABLED=True,
        LAVAPAY_SHOP_ID="shop-uuid",
        LAVAPAY_SECRET_KEY=SECRET,
        LAVAPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
        LAVAPAY_BASE_URL="https://api.lava.ru",
        LAVAPAY_RETURN_URL=None,
        LAVAPAY_FAIL_URL=None,
        LAVAPAY_EXPIRE_MINUTES=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def hmac_hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── Подпись исходящих запросов ───────────────────────────────────────────────
def test_request_signature_is_hmac_of_raw_body():
    body = b'{"sum":100.0,"orderId":"42","shopId":"shop-uuid"}'
    assert lava_client.sign_body(SECRET, body) == hmac_hex(SECRET, body)


@pytest.mark.asyncio
async def test_create_invoice_signs_exactly_what_it_sends():
    """Пересортировка ключей ломает подпись — подписываем отправляемые байты."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content
        seen["signature"] = request.headers.get("Signature")
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"status": "success", "data": {"id": "inv-1", "url": "https://pay/1"}})

    client = lava_client.LavaClient(make_settings(), transport=httpx.MockTransport(handler))
    result = await client.create_invoice(amount=100, order_id="42", hook_url="https://h/webhook/lavapay")

    assert seen["url"] == "https://api.lava.ru/business/invoice/create"
    assert seen["signature"] == hmac_hex(SECRET, seen["body"])
    assert json.loads(seen["body"])["shopId"] == "shop-uuid"
    assert result == {"invoice_id": "inv-1", "url": "https://pay/1"}


@pytest.mark.asyncio
async def test_create_invoice_strips_query_from_return_urls():
    """Lava отвечает 422 на successUrl/failUrl с query string."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"status": "success", "data": {"id": "i", "url": "https://pay"}})

    client = lava_client.LavaClient(make_settings(), transport=httpx.MockTransport(handler))
    await client.create_invoice(
        amount=10, order_id="1",
        success_url="https://app.example.com/payment/7?x=1",
        fail_url="https://app.example.com/payment/7#frag",
    )
    assert seen["payload"]["successUrl"] == "https://app.example.com/payment/7"
    assert seen["payload"]["failUrl"] == "https://app.example.com/payment/7"


@pytest.mark.asyncio
async def test_create_invoice_raises_on_api_error_status():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "error", "error": "wrong shop"})

    client = lava_client.LavaClient(make_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(lava_client.LavaApiError):
        await client.create_invoice(amount=10, order_id="1")


@pytest.mark.asyncio
async def test_create_invoice_raises_without_redirect_url():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "success", "data": {"id": "i"}})

    client = lava_client.LavaClient(make_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(lava_client.LavaApiError):
        await client.create_invoice(amount=10, order_id="1")


# ── Верификация вебхука ──────────────────────────────────────────────────────
def test_webhook_accepts_raw_body_signature():
    raw = b'{"invoice_id":"i","order_id":"42","status":"success","amount":100.0}'
    assert lava_client.verify_webhook(WEBHOOK_SECRET, raw, hmac_hex(WEBHOOK_SECRET, raw)) is True


def test_webhook_accepts_canonical_json_signature():
    """Часть шопов Lava подписывает пере-сериализованный JSON с sorted keys."""
    payload = {"status": "success", "order_id": "42", "amount": 100.0, "invoice_id": "i"}
    raw = json.dumps(payload).encode()
    canonical = json.dumps(
        {"amount": 100, "invoice_id": "i", "order_id": "42", "status": "success"},
        sort_keys=True, separators=(",", ":"),
    ).encode()
    assert lava_client.verify_webhook(WEBHOOK_SECRET, raw, hmac_hex(WEBHOOK_SECRET, canonical)) is True


def test_webhook_ignores_signature_field_in_canonical_form():
    payload = {"order_id": "42", "status": "success", "signature": "deadbeef"}
    raw = json.dumps(payload).encode()
    canonical = json.dumps({"order_id": "42", "status": "success"}, sort_keys=True, separators=(",", ":")).encode()
    assert lava_client.verify_webhook(WEBHOOK_SECRET, raw, hmac_hex(WEBHOOK_SECRET, canonical)) is True


def test_webhook_rejects_wrong_signature():
    raw = b'{"order_id":"42","status":"success"}'
    assert lava_client.verify_webhook(WEBHOOK_SECRET, raw, hmac_hex("other-key", raw)) is False


def test_webhook_rejects_empty_signature():
    assert lava_client.verify_webhook(WEBHOOK_SECRET, b"{}", "") is False


def test_webhook_rejects_when_secret_not_configured():
    """Fail-closed: без webhook-секрета вебхук не принимается никогда."""
    raw = b'{"order_id":"42","status":"success"}'
    assert lava_client.verify_webhook("", raw, hmac_hex(WEBHOOK_SECRET, raw)) is False
    assert lava_client.verify_webhook(None, raw, "anything") is False


def test_webhook_accepts_bearer_prefixed_header():
    raw = b'{"order_id":"42"}'
    assert lava_client.verify_webhook(WEBHOOK_SECRET, raw, f"Bearer {hmac_hex(WEBHOOK_SECRET, raw)}") is True


# ── Статусы ──────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("raw_status,expected", [
    ("success", "succeeded"),
    ("SUCCESS", "succeeded"),
    ("cancel", "failed"),
    ("expired", "failed"),
    ("error", "failed"),
    ("created", "pending"),
    ("weird-new-status", "pending"),
])
def test_status_mapping(raw_status, expected):
    assert lava_client.map_invoice_status(raw_status) == expected


# ── Готовность конфигурации ──────────────────────────────────────────────────
def test_client_requires_webhook_secret_to_be_configured():
    """Без additional key оплату подтвердить нечем — провайдер считается ненастроенным."""
    assert lava_client.is_configured(make_settings()) is True
    assert lava_client.is_configured(make_settings(LAVAPAY_WEBHOOK_SECRET=None)) is False
    assert lava_client.is_configured(make_settings(LAVAPAY_SECRET_KEY=None)) is False
    assert lava_client.is_configured(make_settings(LAVAPAY_SHOP_ID=None)) is False
    assert lava_client.is_configured(make_settings(LAVAPAY_ENABLED=False)) is False
