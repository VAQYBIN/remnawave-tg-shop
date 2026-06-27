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
