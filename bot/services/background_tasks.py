"""Background periodic tasks for the bot process.

Phase 11: periodic entitlement cleanup — deactivates expired catalog
entitlements and reconciles Remnawave squad state.
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.services.panel_client import PanelApiService

logger = logging.getLogger(__name__)

ENTITLEMENT_CLEANUP_INTERVAL_SECONDS = 3600  # hourly


async def periodic_entitlement_cleanup(
    session_factory: async_sessionmaker[AsyncSession],
    panel_service: PanelApiService,
    *,
    interval_seconds: int = ENTITLEMENT_CLEANUP_INTERVAL_SECONDS,
):
    """Deactivate expired catalog entitlements and reconcile Remnawave (Phase 11).

    Runs forever. A temporarily unavailable Remnawave is logged and retried on
    the next cycle; it never crashes the loop.
    """
    from core.services.tariff_cleanup import run_entitlement_cleanup

    logger.info(
        "Starting periodic entitlement cleanup task. Interval: %ss",
        interval_seconds,
    )
    while True:
        await asyncio.sleep(interval_seconds)
        logger.info("Running periodic entitlement cleanup...")
        try:
            async with session_factory() as session:
                await run_entitlement_cleanup(session, panel_service)
        except Exception as e:
            logger.error(
                "Error in periodic_entitlement_cleanup: %s", e, exc_info=True
            )
