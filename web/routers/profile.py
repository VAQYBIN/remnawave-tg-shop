from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.profile import ProfileResponse

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    user = account.telegram_user

    return ProfileResponse(
        account_id=str(account.id),
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
        telegram_user_id=account.telegram_user_id,
        telegram_username=user.username if user else None,
        telegram_first_name=user.first_name if user else None,
    )
