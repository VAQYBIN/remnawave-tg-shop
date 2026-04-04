from fastapi import APIRouter, Depends
from db.models import Account
from web.dependencies import get_current_admin
from web.schemas.admin.dashboard import AdminMeResponse

router = APIRouter()


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(admin: Account = Depends(get_current_admin)):
    return AdminMeResponse(
        account_id=admin.id,
        email=admin.email,
        telegram_user_id=admin.telegram_user_id,
        is_admin=True,
    )
