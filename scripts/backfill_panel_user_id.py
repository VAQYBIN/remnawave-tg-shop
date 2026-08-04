"""Разовый backfill users.panel_user_id после апгрейда панели до Remnawave 3.x.

Remnawave 3.0 удалил поле uuid из объекта пользователя, поэтому сохранённые
users.panel_user_uuid больше ничего не адресуют. Скрипт находит числовой id по
детерминированному имени пользователя на панели и записывает его.

Идемпотентен: обрабатывает только записи с пустым panel_user_id, повторный
запуск безопасен. Запускать после `alembic upgrade head` и деплоя приложения.

Запуск:  python -m scripts.backfill_panel_user_id
"""
import asyncio
import logging
from dataclasses import dataclass

from sqlalchemy import select

from config.settings import Settings
from core.services.panel_identity import resolve_panel_user_id
from db.models import User

logger = logging.getLogger("backfill_panel_user_id")


@dataclass(frozen=True)
class BackfillReport:
    resolved: int = 0
    not_found: int = 0
    skipped: int = 0


async def backfill(session, panel, batch_pause: float = 0.1) -> BackfillReport:
    """Проставить panel_user_id всем пользователям, у которых он пуст."""
    result = await session.execute(select(User).where(User.panel_user_id.is_(None)))
    users = list(result.scalars().all())
    logger.info("Users pending backfill: %d", len(users))

    resolved = not_found = skipped = 0
    for user in users:
        if user.panel_user_id is not None:
            skipped += 1
            continue

        panel_user_id = await resolve_panel_user_id(session, panel, user)
        if panel_user_id is None:
            not_found += 1
            logger.warning(
                "No Remnawave user for local user %s — оставлен без panel_user_id",
                user.user_id,
            )
        else:
            resolved += 1
            user.panel_user_id = panel_user_id

        if batch_pause:
            await asyncio.sleep(batch_pause)

    await session.commit()
    return BackfillReport(resolved=resolved, not_found=not_found, skipped=skipped)


async def _main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from core.services.panel_client import PanelApiService
    from db.database_setup import init_db_connection

    settings = Settings()
    session_factory = init_db_connection(settings)
    panel = PanelApiService(settings)
    try:
        async with session_factory() as session:
            report = await backfill(session, panel)
    finally:
        await panel.close_session()

    logger.info(
        "Backfill finished: resolved=%d not_found=%d skipped=%d",
        report.resolved,
        report.not_found,
        report.skipped,
    )
    if report.not_found:
        logger.warning(
            "%d пользователей не найдено на панели. Проверьте их вручную — "
            "возможно, они были удалены из панели.",
            report.not_found,
        )


if __name__ == "__main__":
    asyncio.run(_main())
