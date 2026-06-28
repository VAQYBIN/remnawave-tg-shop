import asyncio
from types import SimpleNamespace

from core.services import payment_core


def make_settings(**overrides):
    data = dict(
        YOOKASSA_ENABLED=True,
        YOOKASSA_SHOP_ID="shop",
        YOOKASSA_SECRET_KEY="secret",
        PLATEGA_ENABLED=False,
        PLATEGA_MERCHANT_ID=None,
        PLATEGA_SECRET=None,
        FREEKASSA_ENABLED=False,
        FREEKASSA_MERCHANT_ID=None,
        FREEKASSA_FIRST_SECRET=None,
        SEVERPAY_ENABLED=False,
        SEVERPAY_MID=None,
        SEVERPAY_TOKEN=None,
        CRYPTOPAY_ENABLED=False,
        CRYPTOPAY_TOKEN=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def test_available_providers_db_falls_back_to_env_when_db_rows_have_no_credentials(monkeypatch):
    async def fake_enabled(_db):
        return [SimpleNamespace(provider_key="severpay")]

    monkeypatch.setattr(
        "core.dal.payment_provider_config_dal.get_enabled_providers",
        fake_enabled,
    )

    providers = asyncio.run(payment_core.get_available_providers_db(object(), make_settings()))

    assert providers == ["yookassa"]


def test_available_providers_db_preserves_valid_db_order(monkeypatch):
    async def fake_enabled(_db):
        return [SimpleNamespace(provider_key="cryptopay"), SimpleNamespace(provider_key="yookassa")]

    monkeypatch.setattr(
        "core.dal.payment_provider_config_dal.get_enabled_providers",
        fake_enabled,
    )

    providers = asyncio.run(
        payment_core.get_available_providers_db(
            object(),
            make_settings(CRYPTOPAY_ENABLED=True, CRYPTOPAY_TOKEN="token"),
        )
    )

    assert providers == ["cryptopay", "yookassa"]


def test_build_yookassa_receipt_contains_required_fiscalization_fields():
    settings = make_settings(
        YOOKASSA_DEFAULT_RECEIPT_EMAIL="user@example.com",
        YOOKASSA_VAT_CODE=1,
        YOOKASSA_TAX_SYSTEM_CODE=2,
        yk_receipt_payment_mode="full_prepayment",
        yk_receipt_payment_subject="payment",
    )

    receipt = payment_core._build_yookassa_receipt(
        settings,
        amount=150.0,
        description="Оплата подписки на 1 мес.",
    )

    assert receipt == {
        "customer": {"email": "user@example.com"},
        "items": [
            {
                "description": "Оплата подписки на 1 мес.",
                "quantity": "1.00",
                "amount": {"value": "150.00", "currency": "RUB"},
                "vat_code": 1,
                "payment_mode": "full_prepayment",
                "payment_subject": "payment",
            }
        ],
        "tax_system_code": 2,
    }
