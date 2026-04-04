from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_
from datetime import datetime, timezone, timedelta

from db.models import Account, User, Subscription, Payment
from web.dependencies import get_current_admin, get_db
from web.schemas.admin.dashboard import DashboardResponse

router = APIRouter()


@router.get("/dashboard", response_model=DashboardResponse)
async def admin_dashboard(
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

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
            select(func.count(Payment.payment_id)).where(
                Payment.status == "succeeded"
            )
        )
    ).scalar_one()

    total_revenue_row = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                Payment.status == "succeeded"
            )
        )
    ).scalar_one()
    total_revenue = float(total_revenue_row)

    new_users_today = (
        await db.execute(
            select(func.count(User.user_id)).where(
                User.registration_date >= today_start
            )
        )
    ).scalar_one()

    payments_today = (
        await db.execute(
            select(func.count(Payment.payment_id)).where(
                and_(
                    Payment.status == "succeeded",
                    Payment.created_at >= today_start,
                )
            )
        )
    ).scalar_one()

    revenue_today_row = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
                and_(
                    Payment.status == "succeeded",
                    Payment.created_at >= today_start,
                )
            )
        )
    ).scalar_one()
    revenue_today = float(revenue_today_row)

    return DashboardResponse(
        total_users=total_users,
        total_subscriptions=total_subscriptions,
        active_subscriptions=active_subscriptions,
        total_payments=total_payments,
        total_revenue=total_revenue,
        new_users_today=new_users_today,
        payments_today=payments_today,
        revenue_today=revenue_today,
    )
