"""Имя пользователя из Telegram — недоверенный текст.

Бот шлёт всё с `DefaultBotProperties(parse_mode=ParseMode.HTML)`, поэтому
`first_name` вида `</b>` ломает разбор сообщения так же, как ломал просмотр
логов (`can't parse entities`).
"""

import asyncio
import inspect
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import bot.handlers.admin.payments as admin_payments
import bot.handlers.admin.statistics as admin_statistics
import bot.handlers.admin.user_management as user_management
from bot.middlewares.i18n import JsonI18n
from tests.test_admin_logs_html_escaping import (FakeCallback,
                                                 assert_html_is_balanced)

HOSTILE_NAMES = [
    pytest.param("</b>Вася", id="closing-tag"),
    pytest.param("<b>Вася", id="opening-tag"),
    pytest.param("Вася </3", id="broken-heart-emoticon"),
    pytest.param("a < b & c > d", id="raw-angle-brackets"),
]


@pytest.fixture
def i18n():
    return JsonI18n(path="locales", default="ru")


def make_payment(first_name=None, username=None, description="Подписка"):
    return SimpleNamespace(
        payment_id=1,
        user_id=6921250400,
        amount=100.0,
        currency="RUB",
        status="succeeded",
        provider="yookassa",
        description=description,
        subscription_duration_months=1,
        created_at=datetime(2026, 8, 5, 20, 35, tzinfo=timezone.utc),
        user=SimpleNamespace(first_name=first_name, username=username),
    )


@pytest.mark.parametrize("first_name", HOSTILE_NAMES)
def test_payment_text_escapes_first_name(i18n, first_name):
    text = admin_payments.format_payment_text(
        make_payment(first_name=first_name),
        i18n,
        "ru",
        SimpleNamespace(traffic_sale_mode=False),
    )
    assert_html_is_balanced(text)


def test_payment_text_escapes_description(i18n):
    text = admin_payments.format_payment_text(
        make_payment(first_name="Вася", description="Промо <b> на 1 мес"),
        i18n,
        "ru",
        SimpleNamespace(traffic_sale_mode=False),
    )
    assert_html_is_balanced(text)


@pytest.mark.parametrize("first_name", HOSTILE_NAMES)
def test_banned_users_list_escapes_first_name(monkeypatch, i18n, first_name):
    banned = [
        SimpleNamespace(user_id=6921250400,
                        first_name=first_name,
                        username=None)
    ]

    async def fake_get_banned_users(session):
        return banned

    monkeypatch.setattr(user_management.user_dal, "get_banned_users",
                        fake_get_banned_users)

    callback = FakeCallback()
    asyncio.run(
        user_management.view_banned_users_handler(
            callback=callback,
            state=None,
            i18n_data={
                "current_language": "ru",
                "i18n_instance": i18n
            },
            settings=SimpleNamespace(DEFAULT_LANGUAGE="ru"),
            session=None,
        ))

    assert callback.message.sent, f"Список не отправлен, алерты: {callback.alerts}"
    text, _kwargs = callback.message.sent[0]
    assert_html_is_balanced(text)


def test_statistics_does_not_interpolate_raw_name():
    """Сводка статистики строит ту же строку — она обязана идти через хелпер."""
    source = inspect.getsource(admin_statistics)
    assert "{payment.user.first_name}" not in source
    assert "{payment.user.username}" not in source
