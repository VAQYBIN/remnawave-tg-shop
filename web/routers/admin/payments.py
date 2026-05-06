from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_db, get_current_admin
from web.schemas.admin.payments import (
    AdminPaymentListItem,
    AdminPaymentListResponse,
    DailyRevenuePoint,
    PaymentStatsResponse,
    ProviderRevenueItem,
)
from core.dal.payment_dal import (
    get_admin_payments_list,
    get_daily_revenue_chart,
    get_financial_statistics,
    get_payments_stats_by_provider,
)

router = APIRouter()


@router.get("/payments", response_model=AdminPaymentListResponse)
async def list_payments(
    status: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    user_id: Optional[int] = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    payments, total = await get_admin_payments_list(
        db,
        page=page,
        page_size=page_size,
        status=status,
        provider=provider,
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
    )

    items = [
        AdminPaymentListItem(
            payment_id=p.payment_id,
            user_id=p.user_id,
            username=p.user.username if p.user else None,
            first_name=p.user.first_name if p.user else None,
            amount=p.amount,
            original_amount=p.original_amount,
            discount_applied=p.discount_applied,
            currency=p.currency,
            status=p.status,
            provider=p.provider,
            subscription_duration_months=p.subscription_duration_months,
            promo_code=p.promo_code_used.code if p.promo_code_used else None,
            created_at=p.created_at,
        )
        for p in payments
    ]

    return AdminPaymentListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/payments/stats", response_model=PaymentStatsResponse)
async def get_payment_stats(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    base_stats = await get_financial_statistics(db)
    by_provider_raw = await get_payments_stats_by_provider(db)
    daily_chart_raw = await get_daily_revenue_chart(db, days=days)

    return PaymentStatsResponse(
        today_revenue=base_stats["today_revenue"],
        week_revenue=base_stats["week_revenue"],
        month_revenue=base_stats["month_revenue"],
        all_time_revenue=base_stats["all_time_revenue"],
        today_payments_count=base_stats["today_payments_count"],
        by_provider=[ProviderRevenueItem(**p) for p in by_provider_raw],
        daily_chart=[DailyRevenuePoint(**d) for d in daily_chart_raw],
    )
