from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from config.settings import Settings, get_settings
from db.models import Account, Payment
from web.dependencies import get_current_account, get_db
from web.schemas.payment import (
    PaymentResponse,
    PaymentsListResponse,
    PaymentsCountResponse,
    CreatePaymentRequest,
    CreatePaymentResponse,
    PaymentStatusResponse,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=PaymentsListResponse)
async def get_payments(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PaymentsListResponse:
    if not account.telegram_user_id:
        return PaymentsListResponse(items=[], total=0, page=page, limit=limit)

    offset = (page - 1) * limit
    user_id = account.telegram_user_id

    from core.dal.payment_dal import get_user_payments
    payments = await get_user_payments(db, user_id, limit=limit, offset=offset)

    count_result = await db.execute(
        select(func.count()).select_from(Payment).where(Payment.user_id == user_id)
    )
    total = count_result.scalar() or 0

    items = [
        PaymentResponse(
            payment_id=p.payment_id,
            amount=p.amount,
            original_amount=p.original_amount,
            discount_applied=p.discount_applied,
            currency=p.currency,
            status=p.status,
            description=p.description,
            subscription_duration_months=p.subscription_duration_months,
            provider=p.provider,
            created_at=p.created_at,
        )
        for p in payments
    ]

    return PaymentsListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/count", response_model=PaymentsCountResponse)
async def get_payments_count(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PaymentsCountResponse:
    if not account.telegram_user_id:
        return PaymentsCountResponse(total=0)

    count_result = await db.execute(
        select(func.count()).select_from(Payment).where(Payment.user_id == account.telegram_user_id)
    )
    total = count_result.scalar() or 0
    return PaymentsCountResponse(total=total)


@router.post("/create", response_model=CreatePaymentResponse)
async def create_payment(
    body: CreatePaymentRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CreatePaymentResponse:
    from core.services.payment_core import create_web_payment

    try:
        payment_db_id, redirect_url = await create_web_payment(
            db,
            settings,
            account=account,
            provider=body.provider,
            months=body.months,
            promo_code=body.promo_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    from core.dal.payment_dal import get_payment_by_db_id
    payment = await get_payment_by_db_id(db, payment_db_id)

    return CreatePaymentResponse(
        payment_id=payment_db_id,
        redirect_url=redirect_url,
        amount=payment.amount,
        original_amount=payment.original_amount,
        currency=payment.currency,
    )


@router.get("/{payment_id}/status", response_model=PaymentStatusResponse)
async def get_payment_status(
    payment_id: int,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PaymentStatusResponse:
    from core.dal.payment_dal import get_payment_by_db_id

    payment = await get_payment_by_db_id(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.user_id != account.telegram_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return PaymentStatusResponse(
        payment_id=payment.payment_id,
        status=payment.status,
        provider=payment.provider,
        amount=payment.amount,
        currency=payment.currency,
        created_at=payment.created_at,
    )
