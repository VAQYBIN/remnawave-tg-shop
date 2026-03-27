from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.promo import ApplyPromoRequest, PromoApplyResponse, ActiveDiscountResponse

router = APIRouter(prefix="/promo", tags=["promo"])


@router.post("/apply", response_model=PromoApplyResponse)
async def apply_promo(
    body: ApplyPromoRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PromoApplyResponse:
    if not account.telegram_user_id:
        raise HTTPException(
            status_code=400,
            detail="Привязка Telegram обязательна для применения промокода",
        )

    from core.services.promo_core import validate_discount_promo_code
    from core.dal.active_discount_dal import get_active_discount

    is_valid, discount_pct, error = await validate_discount_promo_code(
        db, account.telegram_user_id, body.code
    )

    if not is_valid:
        error_messages = {
            "promo_code_not_found": "Промокод не найден",
            "promo_code_not_found_or_not_discount": "Промокод не найден или не является скидочным",
            "promo_code_already_used_by_user": "Промокод уже был использован",
            "discount_promo_already_active": "У вас уже активна скидка",
            "error_applying_promo_discount": "Ошибка применения промокода",
        }
        detail = error_messages.get(error or "", "Промокод недействителен")
        raise HTTPException(status_code=400, detail=detail)

    # Fetch the reserved discount to get expires_at
    active_disc = await get_active_discount(db, account.telegram_user_id)
    if not active_disc:
        raise HTTPException(status_code=500, detail="Ошибка резервирования скидки")

    # Get promo code string
    from core.dal.promo_code_dal import get_promo_code_by_id
    promo_obj = await get_promo_code_by_id(db, active_disc.promo_code_id)
    promo_code_str = promo_obj.code if promo_obj else body.code.upper()

    return PromoApplyResponse(
        promo_code=promo_code_str,
        discount_percentage=active_disc.discount_percentage,
        expires_at=active_disc.expires_at,
    )


@router.delete("/active-discount", status_code=204)
async def remove_active_discount(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not account.telegram_user_id:
        return

    from core.dal.active_discount_dal import get_active_discount, clear_active_discount
    from core.dal.promo_code_dal import decrement_promo_code_usage

    active_disc = await get_active_discount(db, account.telegram_user_id)
    if active_disc:
        await decrement_promo_code_usage(db, active_disc.promo_code_id)
        await clear_active_discount(db, account.telegram_user_id)
