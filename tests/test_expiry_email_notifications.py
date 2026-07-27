"""Email-канал уведомлений об истечении подписки."""
import uuid
from types import SimpleNamespace

import pytest


def test_account_email_notifications_column_defaults():
    from db.models import Account

    col = Account.__table__.c.email_notifications_enabled
    assert col.nullable is False
    assert col.default.arg is True
    assert col.server_default is not None


import bot.services.panel_webhook_service as pws
from bot.services.panel_webhook_service import PanelWebhookService


class FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def commit(self):
        pass

    async def rollback(self):
        pass


def make_settings(**overrides):
    base = dict(
        SUBSCRIPTION_NOTIFICATIONS_ENABLED=True,
        DEFAULT_LANGUAGE="ru",
        SUBSCRIPTION_NOTIFY_DAYS_BEFORE=3,
        SUBSCRIPTION_NOTIFY_ON_EXPIRE=True,
        SUBSCRIPTION_NOTIFY_AFTER_EXPIRE=True,
        EMAIL_EXPIRY_NOTIFICATIONS_ENABLED=True,
        RESEND_API_KEY="test-key",
        RESEND_FROM_EMAIL="noreply@test.local",
        WEB_FRONTEND_URL="https://app.test",
        WEB_API_URL="https://api.test",
        WEB_JWT_SECRET="test-secret",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_account(**overrides):
    base = dict(
        id=uuid.uuid4(),
        email="user@test.local",
        is_email_verified=True,
        email_notifications_enabled=True,
        language_code="ru",
        telegram_user_id=None,
        site_user_id=-5,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_service(monkeypatch, settings=None, tg_account=None, web_account=None):
    settings = settings or make_settings()
    svc = PanelWebhookService(
        bot=SimpleNamespace(),
        settings=settings,
        i18n=SimpleNamespace(),
        async_session_factory=lambda: FakeSession(),
        panel_service=SimpleNamespace(),
    )

    async def fake_get_user(session, user_id):
        return SimpleNamespace(language_code="ru", first_name="Tester")

    monkeypatch.setattr(pws.user_dal, "get_user_by_id", fake_get_user)
    monkeypatch.setattr(pws, "get_subscribe_only_markup", lambda lang, i18n: None)

    async def fake_get_by_tg(session, tg_id):
        return tg_account

    async def fake_get_user_by_username(session, username):
        if web_account is None:
            return None
        return SimpleNamespace(user_id=web_account.site_user_id)

    async def fake_get_by_site(session, site_user_id):
        return web_account

    monkeypatch.setattr(pws.account_dal, "get_account_by_telegram_id", fake_get_by_tg)
    monkeypatch.setattr(pws.user_dal, "get_user_by_username", fake_get_user_by_username)
    monkeypatch.setattr(pws.account_dal, "get_account_by_site_user_id", fake_get_by_site)

    async def fake_brand():
        return "TestVPN"

    monkeypatch.setattr(svc, "_get_brand_name", fake_brand)

    sent_tg = []

    async def fake_send(user_id, lang, message_key, reply_markup=None, **kwargs):
        sent_tg.append({"user_id": user_id, "key": message_key, **kwargs})

    monkeypatch.setattr(svc, "_send_message", fake_send)

    sent_emails = []

    async def fake_send_email(**kwargs):
        sent_emails.append(kwargs)
        return True

    monkeypatch.setattr(pws, "send_expiry_email", fake_send_email)

    return svc, sent_tg, sent_emails


TG_PAYLOAD = {"telegramId": 123, "expireAt": "2026-07-14T10:00:00.000Z"}
WEB_PAYLOAD = {
    "telegramId": None,
    "username": "web_abcdef123456",
    "expireAt": "2026-07-14T10:00:00.000Z",
}


@pytest.mark.asyncio
async def test_tg_user_with_email_gets_both_channels(monkeypatch):
    account = make_account(telegram_user_id=123)
    svc, sent_tg, sent_emails = make_service(monkeypatch, tg_account=account)
    await svc.handle_event("user.expiration", TG_PAYLOAD, {"expiration": -72})
    assert len(sent_tg) == 1
    assert sent_tg[0]["key"] == "subscription_72h_notification"
    assert len(sent_emails) == 1
    email = sent_emails[0]
    assert email["email"] == "user@test.local"
    assert email["kind"] == "pre_expiry"
    assert email["days_left"] == 3
    assert email["end_date"] == "2026-07-14"
    assert email["brand"] == "TestVPN"
    assert email["renew_url"] == "https://app.test/subscription"
    assert email["unsubscribe_url"].startswith(
        "https://api.test/api/profile/unsubscribe?token="
    )


@pytest.mark.asyncio
async def test_web_only_user_gets_email_only(monkeypatch):
    account = make_account()
    svc, sent_tg, sent_emails = make_service(monkeypatch, web_account=account)
    await svc.handle_event("user.expiration", WEB_PAYLOAD, {"expiration": -24})
    assert sent_tg == []
    assert len(sent_emails) == 1
    assert sent_emails[0]["days_left"] == 1


@pytest.mark.asyncio
async def test_web_only_without_account_is_ignored(monkeypatch):
    svc, sent_tg, sent_emails = make_service(monkeypatch)
    await svc.handle_event("user.expiration", WEB_PAYLOAD, {"expiration": -72})
    assert sent_tg == []
    assert sent_emails == []


@pytest.mark.asyncio
async def test_opt_out_suppresses_email_but_not_tg(monkeypatch):
    account = make_account(telegram_user_id=123, email_notifications_enabled=False)
    svc, sent_tg, sent_emails = make_service(monkeypatch, tg_account=account)
    await svc.handle_event("user.expiration", TG_PAYLOAD, {"expiration": -72})
    assert len(sent_tg) == 1
    assert sent_emails == []


@pytest.mark.asyncio
async def test_unverified_email_suppresses_email(monkeypatch):
    account = make_account(telegram_user_id=123, is_email_verified=False)
    svc, sent_tg, sent_emails = make_service(monkeypatch, tg_account=account)
    await svc.handle_event("user.expiration", TG_PAYLOAD, {"expiration": -72})
    assert len(sent_tg) == 1
    assert sent_emails == []


@pytest.mark.asyncio
async def test_global_flag_off_suppresses_email(monkeypatch):
    account = make_account(telegram_user_id=123)
    settings = make_settings(EMAIL_EXPIRY_NOTIFICATIONS_ENABLED=False)
    svc, sent_tg, sent_emails = make_service(
        monkeypatch, settings=settings, tg_account=account
    )
    await svc.handle_event("user.expiration", TG_PAYLOAD, {"expiration": -72})
    assert len(sent_tg) == 1
    assert sent_emails == []


@pytest.mark.asyncio
async def test_expired_event_sends_expired_email(monkeypatch):
    account = make_account()
    svc, sent_tg, sent_emails = make_service(monkeypatch, web_account=account)
    await svc.handle_event("user.expired", WEB_PAYLOAD)
    assert sent_tg == []
    assert len(sent_emails) == 1
    assert sent_emails[0]["kind"] == "expired"


@pytest.mark.asyncio
async def test_expired_yesterday_offset_sends_email(monkeypatch):
    account = make_account()
    svc, sent_tg, sent_emails = make_service(monkeypatch, web_account=account)
    await svc.handle_event("user.expiration", WEB_PAYLOAD, {"expiration": 24})
    assert len(sent_emails) == 1
    assert sent_emails[0]["kind"] == "expired_yesterday"


@pytest.mark.asyncio
async def test_autorenew_48h_suppresses_email(monkeypatch):
    account = make_account()
    svc, sent_tg, sent_emails = make_service(monkeypatch, web_account=account)

    import core.dal.subscription_dal as subscription_dal

    async def fake_sub(session, user_id):
        return SimpleNamespace(
            provider="yookassa",
            auto_renew_enabled=True,
            pricing_plan_option_id=None,
            user_id=user_id,
        )

    monkeypatch.setattr(
        subscription_dal, "get_active_subscription_by_user_id", fake_sub
    )
    await svc.handle_event("user.expiration", WEB_PAYLOAD, {"expiration": -48})
    assert sent_tg == []
    assert sent_emails == []
