"""
Subscription core service — pure business logic extracted from bot/services/subscription_service.py.
No Aiogram/Bot/i18n dependencies.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from typing import Optional

from core.dal import user_dal, subscription_dal


async def has_active_subscription(session: AsyncSession, user_id: int) -> bool:
    """Return True if user currently has an active subscription (end_date in future)."""
    try:
        user_record = await user_dal.get_user_by_id(session, user_id)
        if not user_record or user_record.panel_user_id is None:
            return False
        active_sub = await subscription_dal.get_active_subscription_by_user_id(
            session, user_id, user_record.panel_user_id
        )
        if not active_sub or not active_sub.end_date:
            return False
        return active_sub.is_active and active_sub.end_date > datetime.now(timezone.utc)
    except Exception:
        return False


async def has_had_any_subscription(session: AsyncSession, user_id: int) -> bool:
    """Return True if user has ever had any subscription (including expired)."""
    return await subscription_dal.has_any_subscription_for_user(session, user_id)


async def get_active_subscription(session: AsyncSession, user_id: int):
    """Get current active subscription for a user, or None."""
    try:
        user_record = await user_dal.get_user_by_id(session, user_id)
        if not user_record:
            return None
        return await subscription_dal.get_active_subscription_by_user_id(
            session, user_id, user_record.panel_user_id
        )
    except Exception as exc:
        logging.error(
            "Error fetching active subscription for user %s: %s", user_id, exc
        )
        return None


async def get_user_panel_id(session: AsyncSession, user_id: int) -> Optional[int]:
    """Return panel_user_id for a given local user_id, or None if not set."""
    user_record = await user_dal.get_user_by_id(session, user_id)
    if user_record:
        return user_record.panel_user_id
    return None
