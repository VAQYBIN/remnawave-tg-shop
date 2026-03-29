from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.referral import ReferralResponse
from core.services.referral_core import get_referral_stats
from core.dal.user_dal import ensure_referral_code, get_user_by_id

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("", response_model=ReferralResponse)
async def get_referral(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ReferralResponse:
    if not account.telegram_user_id:
        raise HTTPException(status_code=404, detail="No Telegram account linked")

    user = await get_user_by_id(db, account.telegram_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    referral_code = await ensure_referral_code(db, user)

    if settings.BOT_USERNAME:
        referral_link = f"https://t.me/{settings.BOT_USERNAME}?start=ref_u{referral_code}"
    else:
        referral_link = f"https://t.me/?start=ref_u{referral_code}"

    stats = await get_referral_stats(db, account.telegram_user_id)

    bonus_days = settings.referral_bonus_inviter if settings.referral_bonus_inviter else None

    return ReferralResponse(
        referral_code=referral_code,
        referral_link=referral_link,
        invited_count=stats["invited_count"],
        purchased_count=stats["purchased_count"],
        bonus_days_per_month=bonus_days,
    )
