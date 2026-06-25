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


def _mask_email(email: str) -> str:
    """Mask an email for privacy: ``anya@proton.me`` -> ``a***@proton.me``."""
    email = (email or "").strip()
    local, sep, domain = email.partition("@")
    if not sep or not local:
        return "***"
    head = local[0]
    return f"{head}***@{domain}"


def _looks_like_email(value: Optional[str]) -> bool:
    return bool(value) and "@" in value


async def attribute_web_referral(
    session: AsyncSession,
    referred_user,
    ref_code: Optional[str],
) -> bool:
    """
    Attach a freshly-registered web user to their inviter by referral code.

    Mirrors the bot's ``start`` flow but for site accounts: sets ``referred_by_id``
    on the new user's row so the existing payment-webhook bonus logic credits both
    sides on the friend's first purchase. Returns True if attribution was applied.
    """
    if not ref_code:
        return False
    code = ref_code.strip()
    if not code:
        return False
    if referred_user.referred_by_id is not None:
        return False

    inviter = await user_dal.get_user_by_referral_code(session, code)
    if not inviter or inviter.user_id == referred_user.user_id:
        return False

    referred_user.referred_by_id = inviter.user_id
    await session.flush()
    logging.info(
        "Web referral attributed: user %s referred by %s (code %s).",
        referred_user.user_id,
        inviter.user_id,
        code,
    )
    return True


async def get_referred_friends(
    session: AsyncSession,
    inviter_user_id: int,
    inviter_bonus_by_months: Dict[int, int],
) -> Dict[str, Any]:
    """
    Build the inviter's referral overview: per-friend rows plus aggregate counts.

    A friend is "activated" once they have at least one succeeded payment; the bonus
    is awarded once per referee on their first succeeded purchase, so we read that
    earliest payment's duration to derive the bonus the inviter earned.
    Email addresses are masked for privacy.
    """
    result = await session.execute(
        text(
            """
            SELECT
                u.user_id,
                u.username,
                u.first_name,
                u.registration_date,
                a.email AS account_email,
                fp.months AS first_paid_months,
                fp.paid_at AS first_paid_at
            FROM users u
            LEFT JOIN accounts a
                ON a.site_user_id = u.user_id OR a.telegram_user_id = u.user_id
            LEFT JOIN LATERAL (
                SELECT p.subscription_duration_months AS months, p.created_at AS paid_at
                FROM payments p
                WHERE p.user_id = u.user_id AND p.status = 'succeeded'
                ORDER BY p.created_at ASC
                LIMIT 1
            ) fp ON TRUE
            WHERE u.referred_by_id = :uid
            ORDER BY u.registration_date DESC NULLS LAST, u.user_id DESC
            """
        ),
        {"uid": inviter_user_id},
    )

    friends = []
    total_bonus_days = 0
    purchased_count = 0
    seen_user_ids = set()

    for row in result.mappings():
        uid = row["user_id"]
        if uid in seen_user_ids:
            # The accounts LEFT JOIN can fan out if a user has both link rows.
            continue
        seen_user_ids.add(uid)

        is_web = uid is not None and uid < 0
        username = row["username"]
        first_name = row["first_name"]
        account_email = row["account_email"]

        # Display name + secondary handle, with email masking for privacy.
        handle = None
        if not is_web and username and not username.startswith("web_"):
            name = first_name if (first_name and not _looks_like_email(first_name)) else f"@{username}"
            handle = f"@{username}"
        elif _looks_like_email(account_email) or _looks_like_email(first_name):
            name = _mask_email(account_email or first_name)
        elif first_name and not _looks_like_email(first_name):
            name = first_name
        else:
            name = None  # frontend falls back to a generic label

        activated = row["first_paid_months"] is not None or row["first_paid_at"] is not None
        bonus_days = 0
        if activated:
            purchased_count += 1
            months = row["first_paid_months"] or 0
            bonus_days = inviter_bonus_by_months.get(int(months), 0) or 0
            total_bonus_days += bonus_days

        reg_date = row["registration_date"]
        friends.append(
            {
                "name": name,
                "handle": handle,
                "registered_at": reg_date.isoformat() if reg_date else None,
                "status": "activated" if activated else "registered",
                "bonus_days": bonus_days,
            }
        )

    return {
        "friends": friends,
        "invited_count": len(friends),
        "purchased_count": purchased_count,
        "total_bonus_days": total_bonus_days,
    }
