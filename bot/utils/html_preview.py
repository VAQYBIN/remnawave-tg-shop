"""Подготовка недоверенных строк к выводу с parse_mode=HTML.

Содержимое `message_logs` (текст сообщений, callback_data, имена из Telegram)
попадает в админские сообщения как есть. Любой `<` в нём — и Telegram
отвечает `can't parse entities`, а обрезка превью может ещё и разрезать
HTML-сущность пополам. Поэтому: сначала режем сырую строку, потом экранируем.
"""

from typing import Optional

from aiogram.utils.text_decorations import html_decoration

__all__ = ["escape_html", "escape_html_preview", "format_user_reference"]


def escape_html(value: Optional[str]) -> str:
    """Экранирует `<`, `>` и `&` для parse_mode=HTML."""
    if not value:
        return ""
    return html_decoration.quote(str(value))


def escape_html_preview(value: Optional[str],
                        limit: int,
                        placeholder: str = "",
                        ellipsis: str = "...") -> str:
    """Обрезает сырую строку до `limit` символов и экранирует результат.

    Порядок важен: экранирование после обрезки гарантирует, что срез не
    разрежет ни исходный тег, ни подставленную HTML-сущность.
    """
    raw = str(value) if value else ""
    if not raw:
        return escape_html(placeholder) if placeholder else ""

    truncated = raw[:limit]
    suffix = ellipsis if len(raw) > limit else ""
    return escape_html(truncated) + suffix


def format_user_reference(username: Optional[str] = None,
                          first_name: Optional[str] = None,
                          fallback: str = "") -> str:
    """`@username`, иначе имя, иначе `fallback` — всё экранировано.

    Используется в админских списках, где пользователя надо назвать в тексте
    сообщения с parse_mode=HTML.
    """
    if username:
        return "@" + escape_html(str(username).lstrip("@"))
    if first_name:
        return escape_html(first_name)
    return escape_html(fallback)
