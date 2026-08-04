"""Резолв числового идентификатора пользователя на панели Remnawave.

Remnawave 3.x убрал поле ``uuid`` из объекта пользователя — теперь его адресует
числовой ``id``. Локально он живёт в ``users.panel_user_id``; этот модуль — та
единственная точка, где он добывается и запоминается.

Ключ к миграции существующих записей: имя пользователя на панели детерминировано
(``tg_<user_id>`` для Telegram, ``web_<hex>`` для веба), а ``GET
/users/by-username/{username}`` в v3 сохранён. Поэтому любой пользователь, у
которого ``panel_user_id`` ещё не проставлен, чинится лениво при первом же
обращении.
"""
import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.dal import user_dal

logger = logging.getLogger(__name__)


def panel_username_for(user: Any, account: Any = None) -> str:
    """Имя пользователя на панели — то же, что использует создание юзера.

    Веб-пользователи имеют отрицательный ``user_id`` (см. web_user_id_seq).
    """
    if user.user_id < 0:
        if account is not None:
            from core.dal.account_dal import web_panel_username

            return web_panel_username(account)
        return f"web_{abs(user.user_id)}"
    return f"tg_{user.user_id}"


def _extract_id(panel_user: Any) -> Optional[int]:
    if not isinstance(panel_user, dict):
        return None
    raw = panel_user.get("id")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning("Panel returned a non-numeric user id: %r", raw)
        return None


async def _remember(
    session: Optional[AsyncSession], user: Any, panel_user_id: int
) -> None:
    await user_dal.update_user(session, user.user_id, {"panel_user_id": panel_user_id})
    user.panel_user_id = panel_user_id


async def resolve_panel_user_id(
    session: Optional[AsyncSession],
    panel: Any,
    db_user: Any,
    account: Any = None,
) -> Optional[int]:
    """Числовой id пользователя на панели, или None если его там нет.

    None означает «панель не подтвердила такого пользователя» — вызывающий
    создаёт его обычным ``create_panel_user``.
    """
    if db_user is None:
        return None

    stored = getattr(db_user, "panel_user_id", None)
    if stored is not None:
        return int(stored)

    username = panel_username_for(db_user, account)
    by_username = await panel.get_users_by_filter(username=username)
    if by_username:
        panel_user_id = _extract_id(by_username[0])
        if panel_user_id is not None:
            await _remember(session, db_user, panel_user_id)
            return panel_user_id

    # Веб-пользователи не имеют telegramId на панели — искать по нему нечего.
    if db_user.user_id > 0:
        by_telegram = await panel.get_users_by_filter(telegram_id=db_user.user_id)
        if by_telegram and len(by_telegram) > 1:
            logger.error(
                "Multiple Remnawave users share telegramId %s; refusing to guess.",
                db_user.user_id,
            )
            return None
        if by_telegram:
            panel_user_id = _extract_id(by_telegram[0])
            if panel_user_id is not None:
                await _remember(session, db_user, panel_user_id)
                return panel_user_id

    logger.info(
        "No Remnawave user found for local user %s (username %s).",
        db_user.user_id,
        username,
    )
    return None
