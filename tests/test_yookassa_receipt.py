"""Чек 54-ФЗ для веб-платежей YooKassa.

Формат по докам YooKassa (POST /v3/payments, объект receipt):
vat_code / tax_system_code — целые, quantity — число, amount.value — строка.
"""
from types import SimpleNamespace

import httpx
import pytest

from core.services import payment_core


def make_settings(**overrides):
    base = dict(
        YOOKASSA_SHOP_ID="shop",
        YOOKASSA_SECRET_KEY="secret",
        YOOKASSA_DEFAULT_RECEIPT_EMAIL=None,
        YOOKASSA_VAT_CODE=1,
        YOOKASSA_TAX_SYSTEM_CODE=None,
        yk_receipt_payment_mode="full_prepayment",
        yk_receipt_payment_subject="service",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── Сборка чека ──────────────────────────────────────────────────────────────
def test_no_receipt_without_any_email():
    """Магазины без фискализации продолжают работать: чек просто не формируется."""
    assert payment_core.build_yookassa_receipt(make_settings(), amount=150.0, description="Подписка") is None


def test_receipt_uses_default_email():
    receipt = payment_core.build_yookassa_receipt(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="shop@example.com"),
        amount=150.0,
        description="Подписка на 1 мес.",
    )
    assert receipt["customer"] == {"email": "shop@example.com"}
    assert receipt["items"] == [{
        "description": "Подписка на 1 мес.",
        "quantity": 1,
        "amount": {"value": "150.00", "currency": "RUB"},
        "vat_code": 1,
        "payment_mode": "full_prepayment",
        "payment_subject": "service",
    }]
    assert "tax_system_code" not in receipt


def test_customer_email_wins_over_default():
    """Чек должен уходить покупателю, а не на служебный адрес магазина."""
    receipt = payment_core.build_yookassa_receipt(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="shop@example.com"),
        amount=10.0,
        description="X",
        customer_email="buyer@example.com",
    )
    assert receipt["customer"] == {"email": "buyer@example.com"}


def test_tax_system_code_added_when_configured():
    receipt = payment_core.build_yookassa_receipt(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="shop@example.com", YOOKASSA_TAX_SYSTEM_CODE=2),
        amount=10.0,
        description="X",
    )
    assert receipt["tax_system_code"] == 2


def test_vat_code_is_integer():
    receipt = payment_core.build_yookassa_receipt(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="a@b.c", YOOKASSA_VAT_CODE="1"),
        amount=10.0,
        description="X",
    )
    assert receipt["items"][0]["vat_code"] == 1


def test_description_is_truncated_to_128_chars():
    receipt = payment_core.build_yookassa_receipt(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="a@b.c"),
        amount=10.0,
        description="Ы" * 200,
    )
    assert len(receipt["items"][0]["description"]) == 128


# ── Интеграция с созданием платежа ───────────────────────────────────────────
@pytest.mark.asyncio
async def test_payment_payload_without_receipt_when_not_configured(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "yk-1", "confirmation": {"confirmation_url": "https://pay"}})

    _patch_httpx(monkeypatch, handler)
    await payment_core._create_yookassa_payment(
        make_settings(), payment_db_id=1, user_id=2, months=1,
        amount=150.0, description="Подписка", return_url="https://app/payment/1",
        idempotency_key="key",
    )
    assert "receipt" not in seen["payload"]


@pytest.mark.asyncio
async def test_payment_payload_includes_receipt_when_configured(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "yk-1", "confirmation": {"confirmation_url": "https://pay"}})

    _patch_httpx(monkeypatch, handler)
    await payment_core._create_yookassa_payment(
        make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="shop@example.com"),
        payment_db_id=1, user_id=2, months=1, amount=150.0,
        description="Подписка", return_url="https://app/payment/1",
        idempotency_key="key", customer_email="buyer@example.com",
    )
    assert seen["payload"]["receipt"]["customer"] == {"email": "buyer@example.com"}


@pytest.mark.asyncio
async def test_payment_payload_is_not_logged(monkeypatch, caplog):
    """В payload есть e-mail покупателя — он не должен попадать в логи."""
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "yk-1", "confirmation": {"confirmation_url": "https://pay"}})

    _patch_httpx(monkeypatch, handler)
    with caplog.at_level("INFO"):
        await payment_core._create_yookassa_payment(
            make_settings(YOOKASSA_DEFAULT_RECEIPT_EMAIL="shop@example.com"),
            payment_db_id=1, user_id=2, months=1, amount=150.0,
            description="Подписка", return_url="https://app/payment/1",
            idempotency_key="key", customer_email="buyer@example.com",
        )
    assert "buyer@example.com" not in caplog.text


def _patch_httpx(monkeypatch, handler):
    """Подменяет httpx.AsyncClient на клиент с MockTransport."""
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(payment_core.httpx, "AsyncClient", factory)
