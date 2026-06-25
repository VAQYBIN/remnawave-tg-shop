from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.referral import ReferralResponse, ReferralFriend
from core.services.referral_core import get_referred_friends
from core.dal.user_dal import ensure_referral_code, get_user_by_id
from core.dal.account_dal import ensure_site_user_for_account

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("", response_model=ReferralResponse)
async def get_referral(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ReferralResponse:
    # Resolve the inviter's users row. Telegram-linked accounts use their TG user;
    # web-only accounts get a lazily-provisioned site user so referrals work even
    # when Telegram is unavailable.
    if account.telegram_user_id:
        user = await get_user_by_id(db, account.telegram_user_id)
    else:
        user = await ensure_site_user_for_account(db, account)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    referral_code = await ensure_referral_code(db, user)

    base_url = settings.WEB_FRONTEND_URL.rstrip("/")
    referral_link = f"{base_url}/register?ref={referral_code}"

    telegram_link = None
    if settings.BOT_USERNAME:
        telegram_link = f"https://t.me/{settings.BOT_USERNAME}?start=ref_u{referral_code}"

    overview = await get_referred_friends(
        db, user.user_id, settings.referral_bonus_inviter
    )

    bonus_days = settings.referral_bonus_inviter if settings.referral_bonus_inviter else None

    return ReferralResponse(
        referral_code=referral_code,
        referral_link=referral_link,
        telegram_link=telegram_link,
        invited_count=overview["invited_count"],
        purchased_count=overview["purchased_count"],
        total_bonus_days=overview["total_bonus_days"],
        bonus_days_per_month=bonus_days,
        friends=[ReferralFriend(**f) for f in overview["friends"]],
    )
