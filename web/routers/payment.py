from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

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
from core.services.telegram_notify import send_payment_reminder_after_delay
from core.dal.account_dal import get_account_user_ids

_REMINDER_DELAY_SECONDS = 15 * 60  # 15 minutes

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=PaymentsListResponse)
async def get_payments(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PaymentsListResponse:
    user_ids = get_account_user_ids(account)
    if not user_ids:
        return PaymentsListResponse(items=[], total=0, page=page, limit=limit)

    offset = (page - 1) * limit

    from core.dal.payment_dal import get_user_payments
    payments = await get_user_payments(db, user_ids[0], limit=limit, offset=offset)
    if len(user_ids) > 1:
        result = await db.execute(
            select(Payment)
            .where(Payment.user_id.in_(user_ids))
            .order_by(Payment.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        payments = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).select_from(Payment).where(Payment.user_id.in_(user_ids))
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
    user_ids = get_account_user_ids(account)
    if not user_ids:
        return PaymentsCountResponse(total=0)

    count_result = await db.execute(
        select(func.count()).select_from(Payment).where(Payment.user_id.in_(user_ids))
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
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Payment provider error")

    from core.dal.payment_dal import get_payment_by_db_id
    payment = await get_payment_by_db_id(db, payment_db_id)

    # Telegram reminder after 15 min (fire-and-forget, sent only if still pending)
    if account.telegram_user_id and settings.BOT_TOKEN:
        promo_code_str: str | None = None
        discount_pct: int | None = None
        if payment.promo_code_used:
            promo_code_str = payment.promo_code_used.code
            discount_pct = payment.promo_code_used.discount_percentage

        import asyncio
        from web.dependencies import _get_session_factory
        asyncio.ensure_future(
            send_payment_reminder_after_delay(
                delay_seconds=_REMINDER_DELAY_SECONDS,
                session_factory=_get_session_factory(),
                bot_token=settings.BOT_TOKEN,
                telegram_user_id=account.telegram_user_id,
                payment_id=payment_db_id,
                frontend_url=settings.WEB_FRONTEND_URL,
                months=body.months,
                amount=payment.amount,
                currency=payment.currency,
                provider=body.provider,
                original_amount=payment.original_amount,
                discount_applied=payment.discount_applied,
                discount_percentage=discount_pct,
                promo_code=promo_code_str,
            )
        )

    return CreatePaymentResponse(
        payment_id=payment_db_id,
        redirect_url=redirect_url,
        amount=payment.amount,
        original_amount=payment.original_amount,
        currency=payment.currency,
    )


@router.get("/pending/latest", response_model=PaymentStatusResponse | None)
async def get_pending_payment(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> PaymentStatusResponse | None:
    user_ids = get_account_user_ids(account)
    if not user_ids:
        return None

    from core.dal.payment_dal import get_latest_pending_payment_by_user
    payment = await get_latest_pending_payment_by_user(db, user_ids[0])
    if len(user_ids) > 1:
        result = await db.execute(
            select(Payment)
            .where(Payment.user_id.in_(user_ids), Payment.status == "pending")
            .options(selectinload(Payment.promo_code_used))
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        payment = result.scalar_one_or_none()
    if not payment:
        return None

    return _payment_to_status_response(payment)


@router.post("/{payment_id}/expire", status_code=204)
async def expire_payment(
    payment_id: int,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Mark a payment as expired if it belongs to the current user and is stale (≥65 min old).

    Called by the frontend when the payment page determines the invoice has expired
    so the dashboard banner is removed without waiting for the background cleanup.
    """
    from core.dal.payment_dal import get_payment_by_db_id, expire_payment_if_stale

    payment = await get_payment_by_db_id(db, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.user_id not in get_account_user_ids(account):
        raise HTTPException(status_code=403, detail="Forbidden")

    await expire_payment_if_stale(db, payment_id)
    return Response(status_code=204)


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

    if payment.user_id not in get_account_user_ids(account):
        raise HTTPException(status_code=403, detail="Forbidden")

    return _payment_to_status_response(payment)


def _payment_to_status_response(payment: Payment) -> PaymentStatusResponse:
    return PaymentStatusResponse(
        payment_id=payment.payment_id,
        status=payment.status,
        provider=payment.provider,
        amount=payment.amount,
        original_amount=payment.original_amount,
        discount_applied=payment.discount_applied,
        currency=payment.currency,
        description=payment.description,
        subscription_duration_months=payment.subscription_duration_months,
        redirect_url=payment.redirect_url,
        promo_code=payment.promo_code_used.code if payment.promo_code_used else None,
        created_at=payment.created_at,
    )
