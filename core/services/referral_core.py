"""
Referral core service — pure business logic extracted from bot/services/referral_service.py.
No Aiogram/Bot/i18n dependencies.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any

from core.dal import user_dal, payment_dal


async def get_referral_stats(session: AsyncSession, user_id: int) -> Dict[str, Any]:
    """Get referral statistics for a user."""
    try:
        # Count total invited users (referrals)
        invited_count_result = await session.execute(
            text("SELECT COUNT(*) FROM users WHERE referred_by_id = :user_id"),
            {"user_id": user_id}
        )
        invited_count = invited_count_result.scalar() or 0

        # Count users who made successful payments (purchased subscription)
        purchased_count_result = await session.execute(
            text("""
                SELECT COUNT(DISTINCT u.user_id)
                FROM users u
                JOIN payments p ON u.user_id = p.user_id
                WHERE u.referred_by_id = :user_id
                AND p.status = 'succeeded'
            """),
            {"user_id": user_id}
        )
        purchased_count = purchased_count_result.scalar() or 0

        return {
            "invited_count": invited_count,
            "purchased_count": purchased_count
        }
    except Exception as e:
        logging.error(f"Error getting referral stats for user {user_id}: {e}")
        return {
            "invited_count": 0,
            "purchased_count": 0
        }


async def generate_referral_link(
    session: AsyncSession,
    bot_username: str,
    inviter_user_id: int,
) -> Optional[str]:
    """Generate a referral link for a user. Returns None if referral is not applicable."""
    try:
        user = await user_dal.get_user_by_id(session, inviter_user_id)
        if not user:
            logging.warning(
                "Unable to generate referral link: user %s not found.",
                inviter_user_id,
            )
            return None

        referral_code = await user_dal.ensure_referral_code(session, user)
        if not referral_code:
            logging.warning(
                "User %s has no referral code even after regeneration attempt.",
                inviter_user_id,
            )
            return None

        return f"https://t.me/{bot_username}?start=ref_u{referral_code}"
    except Exception as exc:
        logging.error(
            "Failed to generate referral link for user %s: %s",
            inviter_user_id,
            exc,
            exc_info=True,
        )
        return None


def calculate_referral_bonus_days(
    settings_referral_bonus: Dict[int, int],
    purchased_subscription_months: int,
) -> Optional[int]:
    """
    Calculate referral bonus days based on settings and subscription duration.
    Returns None if no bonus is configured for this duration.
    """
    return settings_referral_bonus.get(purchased_subscription_months)
