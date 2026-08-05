"""Регресс на «can't parse entities» при просмотре логов пользователя.

Содержимое message_logs.content — это сырой пользовательский ввод (текст
сообщения, callback_data). Оно подставлялось в HTML-сообщение без
экранирования и обрезалось до N символов, из-за чего Telegram отвечал
`Bad Request: can't parse entities: Unclosed end tag at byte offset ...`.
"""

import asyncio
import re
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import bot.handlers.admin.logs_admin as logs_admin
import bot.handlers.admin.user_management as user_management
from bot.middlewares.i18n import JsonI18n

# Теги, которые Telegram принимает в parse_mode=HTML.
_TAG = re.compile(
    r"<(/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|a|blockquote|tg-spoiler)"
    r"((?:\s[^<>]*)?)>")


def assert_html_is_balanced(text: str) -> None:
    """Грубая эмуляция HTML-парсера Telegram: любой `<` обязан быть валидным
    тегом, а теги — сбалансированными. Именно на этом падал бот."""
    stack = []
    pos = 0
    while True:
        start = text.find("<", pos)
        if start == -1:
            break
        match = _TAG.match(text, start)
        assert match, (
            f"Невалидный тег на позиции {start}: {text[start:start + 40]!r}")
        closing, tag, _attrs = match.groups()
        if closing:
            assert stack and stack[-1] == tag, (
                f"Непарный закрывающий тег </{tag}> на позиции {start}")
            stack.pop()
        else:
            stack.append(tag)
        pos = match.end()
    assert not stack, f"Незакрытые теги: {stack}"
    # `>` вне тега Telegram допускает, но экранированный текст его не содержит.
    assert ">" not in _TAG.sub("", text), (
        f"Неэкранированный `>` в сообщении: {text!r}")


def make_log(content: str, event_type: str = "message:text"):
    return SimpleNamespace(
        timestamp=datetime(2026, 8, 5, 20, 35, tzinfo=timezone.utc),
        event_type=event_type,
        content=content,
        user_id=6921250400,
        telegram_username="Rembo2235",
        telegram_first_name="Rembo",
    )


class FakeMessage:
    def __init__(self):
        self.sent = []

    async def edit_text(self, text=None, **kwargs):
        self.sent.append((text, kwargs))

    async def answer(self, text=None, **kwargs):
        self.sent.append((text, kwargs))


class FakeCallback:
    def __init__(self):
        self.message = FakeMessage()
        self.alerts = []

    async def answer(self, text=None, show_alert=False):
        self.alerts.append((text, show_alert))


@pytest.fixture
def i18n():
    return JsonI18n(path="locales", default="ru")


BREAKING_CONTENTS = [
    pytest.param("Привет </3 мир", id="broken-heart-emoticon"),
    pytest.param("a" * 47 + "</b>хвост", id="truncation-splits-end-tag"),
    pytest.param("a" * 48 + "<code>хвост", id="truncation-splits-start-tag"),
    pytest.param("5 < 7 & 7 > 5", id="raw-angle-brackets"),
]


@pytest.mark.parametrize("content", BREAKING_CONTENTS)
def test_user_card_logs_escape_content(monkeypatch, i18n, content):
    logs = [make_log(content)]

    async def fake_get_user_message_logs(session, user_id, limit, offset):
        return logs

    monkeypatch.setattr(user_management.message_log_dal,
                        "get_user_message_logs", fake_get_user_message_logs)

    callback = FakeCallback()
    user = SimpleNamespace(user_id=6921250400)

    asyncio.run(
        user_management.handle_view_user_logs(
            callback=callback,
            user=user,
            session=None,
            settings=SimpleNamespace(),
            i18n_instance=i18n,
            lang="ru",
        ))

    assert callback.message.sent, "Сообщение с логами не было отправлено"
    text, kwargs = callback.message.sent[0]
    assert kwargs.get("parse_mode") == "HTML"
    assert_html_is_balanced(text)


@pytest.mark.parametrize("content", BREAKING_CONTENTS)
def test_logs_page_escapes_content(i18n, content):
    message = FakeMessage()

    asyncio.run(
        logs_admin._display_formatted_logs(
            target_message=message,
            logs=[make_log(content)],
            total_logs=1,
            current_page_idx=0,
            settings=SimpleNamespace(LOGS_PAGE_SIZE=10),
            title_key="admin_user_logs_title",
            base_pagination_callback_data="admin_logs:view_user:6921250400",
            i18n=i18n,
            current_lang="ru",
            title_kwargs={"user_display": "Rembo"},
        ))

    assert message.sent, "Страница логов не была отправлена"
    text, _kwargs = message.sent[0]
    assert_html_is_balanced(text)


def test_logs_page_escapes_user_display(i18n):
    """first_name/username приходят из Telegram и тоже могут содержать теги."""
    message = FakeMessage()
    log = make_log("обычный текст")
    log.telegram_first_name = "</b>Вася"
    log.telegram_username = "vasya"

    asyncio.run(
        logs_admin._display_formatted_logs(
            target_message=message,
            logs=[log],
            total_logs=1,
            current_page_idx=0,
            settings=SimpleNamespace(LOGS_PAGE_SIZE=10),
            title_key="admin_user_logs_title",
            base_pagination_callback_data="admin_logs:view_user:6921250400",
            i18n=i18n,
            current_lang="ru",
            title_kwargs={"user_display": "</i>Вася"},
        ))

    text, _kwargs = message.sent[0]
    assert_html_is_balanced(text)


def test_preview_truncates_before_escaping():
    """Обрезка идёт по сырому тексту: HTML-сущности не должны рваться пополам."""
    from bot.utils.html_preview import escape_html_preview

    preview = escape_html_preview("<" * 60, limit=50)
    assert preview == "&lt;" * 50 + "..."
