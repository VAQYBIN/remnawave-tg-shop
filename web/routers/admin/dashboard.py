from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone, timedelta

from db.models import Account, User, Subscription, Payment
from web.dependencies import get_current_admin, get_db
from web.schemas.admin.dashboard import DashboardResponse, RecentPaymentItem

router = APIRouter()


@router.get("/dashboard", response_model=DashboardResponse)
async def admin_dashboard(
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    expiring_threshold = now + timedelta(days=3)

    # --- All-time ---
    total_users = (await db.execute(select(func.count(User.user_id)))).scalar_one()

    total_subscriptions = (
        await db.execute(select(func.count(Subscription.subscription_id)))
    ).scalar_one()

    active_subscriptions = (
        await db.execute(
            select(func.count(Subscription.subscription_id)).where(
                Subscription.is_active == True
            )
        )
    ).scalar_one()

    total_payments = (
        await db.execute(
            select(func.count(Payment.payment_id)).where(Payment.status == "succeeded")
        )
    ).scalar_one()

    total_revenue = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                    Payment.status == "succeeded"
                )
            )
        ).scalar_one()
    )

    # --- Today ---
    new_users_today = (
        await db.execute(
            select(func.count(User.user_id)).where(User.registration_date >= today_start)
        )
    ).scalar_one()

    payments_today = (
        await db.execute(
            select(func.count(Payment.payment_id)).where(
                and_(Payment.status == "succeeded", Payment.created_at >= today_start)
            )
        )
    ).scalar_one()

    revenue_today = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                    and_(Payment.status == "succeeded", Payment.created_at >= today_start)
                )
            )
        ).scalar_one()
    )

    # --- 7 days ---
    new_users_7days = (
        await db.execute(
            select(func.count(User.user_id)).where(User.registration_date >= week_start)
        )
    ).scalar_one()

    revenue_7days = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                    and_(Payment.status == "succeeded", Payment.created_at >= week_start)
                )
            )
        ).scalar_one()
    )

    # --- 30 days ---
    revenue_30days = float(
        (
            await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                    and_(Payment.status == "succeeded", Payment.created_at >= month_start)
                )
            )
        ).scalar_one()
    )

    # --- Expiring soon (active subs expiring in next 3 days) ---
    expiring_soon_count = (
        await db.execute(
            select(func.count(Subscription.subscription_id)).where(
                and_(
                    Subscription.is_active == True,
                    Subscription.end_date >= now,
                    Subscription.end_date <= expiring_threshold,
                )
            )
        )
    ).scalar_one()

    # --- Recent payments (last 5 succeeded) ---
    recent_rows = (
        await db.execute(
            select(Payment)
            .where(Payment.status == "succeeded")
            .order_by(Payment.created_at.desc())
            .limit(5)
            .options(selectinload(Payment.user))
        )
    ).scalars().all()

    recent_payments = [
        RecentPaymentItem(
            payment_id=p.payment_id,
            user_id=p.user_id,
            username=p.user.username if p.user else None,
            first_name=p.user.first_name if p.user else None,
            amount=p.amount,
            currency=p.currency,
            status=p.status,
            provider=p.provider,
            created_at=p.created_at,
        )
        for p in recent_rows
    ]

    return DashboardResponse(
        new_users_today=new_users_today,
        payments_today=payments_today,
        revenue_today=revenue_today,
        new_users_7days=new_users_7days,
        revenue_7days=revenue_7days,
        revenue_30days=revenue_30days,
        total_users=total_users,
        total_subscriptions=total_subscriptions,
        active_subscriptions=active_subscriptions,
        total_payments=total_payments,
        total_revenue=total_revenue,
        expiring_soon_count=expiring_soon_count,
        recent_payments=recent_payments,
    )
