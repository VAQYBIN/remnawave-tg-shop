"""Webhook handling across Remnawave versions (v2.8.0 consolidated user.expiration)."""
import json
from types import SimpleNamespace

import pytest

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
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_service(monkeypatch, settings=None):
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

    sent = []

    async def fake_send(user_id, lang, message_key, reply_markup=None, **kwargs):
        sent.append({"user_id": user_id, "key": message_key, **kwargs})

    monkeypatch.setattr(svc, "_send_message", fake_send)
    return svc, sent


@pytest.mark.asyncio
async def test_v28_pre_expiry_offset_sends_reminder(monkeypatch):
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expiration", payload, {"expiration": -72})
    assert len(sent) == 1
    assert sent[0]["key"] == "subscription_72h_notification"
    assert sent[0]["end_date"] == "2026-07-01"


@pytest.mark.asyncio
async def test_v28_post_expiry_offset_sends_expired_yesterday(monkeypatch):
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expiration", payload, {"expiration": 24})
    assert len(sent) == 1
    assert sent[0]["key"] == "subscription_expired_yesterday_notification"


@pytest.mark.asyncio
async def test_v28_unmapped_offset_is_ignored(monkeypatch):
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expiration", payload, {"expiration": -168})
    assert sent == []


@pytest.mark.asyncio
async def test_v28_missing_meta_is_ignored(monkeypatch):
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expiration", payload, None)
    assert sent == []


@pytest.mark.asyncio
async def test_legacy_discrete_event_still_works(monkeypatch):
    """Backward compatibility with Remnawave < 2.8.0."""
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expires_in_72_hours", payload)
    assert len(sent) == 1
    assert sent[0]["key"] == "subscription_72h_notification"


@pytest.mark.asyncio
async def test_user_expired_event_unchanged(monkeypatch):
    svc, sent = make_service(monkeypatch)
    payload = {"telegramId": 123, "expireAt": "2026-07-01T10:00:00.000Z"}
    await svc.handle_event("user.expired", payload)
    assert len(sent) == 1
    assert sent[0]["key"] == "subscription_expired_notification"
