from typing import Optional, Dict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from db.models import Account, User
from web.dependencies import get_db, get_current_admin, get_settings_dep
from config.settings import Settings
from web.schemas.admin.users import (
    AdminUserListItem,
    AdminUserListResponse,
    AdminUserDetailResponse,
    AdminSubscriptionDetail,
    AdminPaymentItem,
    BanRequest,
    AddDaysRequest,
    AddTrafficRequest,
)
from core.dal.user_dal import admin_search_users, get_user_by_id, update_user
from core.dal.subscription_dal import get_active_subscription_by_user_id
from core.dal.payment_dal import get_user_payments, get_user_total_paid
from core.services.panel_client import PanelApiService
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log

router = APIRouter()


async def _load_accounts_by_user_ids(
    db: AsyncSession, user_ids: list[int]
) -> Dict[int, Account]:
    """Load Account records for a list of Telegram user IDs. Returns {user_id: Account}."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(Account).where(Account.telegram_user_id.in_(user_ids))
    )
    return {a.telegram_user_id: a for a in result.scalars().all()}


_ALLOWED_ORDER_BY = frozenset(
    {"user_id", "first_name", "registration_date", "is_banned", "subscription_end_date"}
)


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    query: Optional[str] = Query(None, description="Поиск по username, имени, email или Telegram ID"),
    is_banned: Optional[bool] = Query(None),
    has_subscription: Optional[bool] = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    order_by: str = Query("registration_date"),
    order: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    # whitelist sort fields to prevent SQL injection via column names
    safe_order_by = order_by if order_by in _ALLOWED_ORDER_BY else "registration_date"
    safe_order = "asc" if order == "asc" else "desc"

    users, total = await admin_search_users(
        db,
        query=query,
        is_banned=is_banned,
        has_subscription=has_subscription,
        page=page,
        page_size=page_size,
        order_by=safe_order_by,
        order=safe_order,
    )

    # Load accounts separately to avoid async lazy-load error
    user_ids = [u.user_id for u in users]
    accounts = await _load_accounts_by_user_ids(db, user_ids)

    now = datetime.now(timezone.utc)
    items = []
    for user in users:
        account = accounts.get(user.user_id)
        email: Optional[str] = account.email if account else None

        # Find active subscription among already-loaded subscriptions
        active_sub = None
        for sub in (user.subscriptions or []):
            if sub.is_active and sub.end_date and sub.end_date > now:
                if active_sub is None or sub.end_date > active_sub.end_date:
                    active_sub = sub

        items.append(AdminUserListItem(
            user_id=user.user_id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            is_banned=user.is_banned,
            registration_date=user.registration_date,
            panel_user_uuid=user.panel_user_uuid,
            email=email,
            has_active_subscription=active_sub is not None,
            subscription_end_date=active_sub.end_date if active_sub else None,
        ))

    return AdminUserListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
async def get_admin_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.subscriptions))
        .where(User.user_id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Load account separately
    account_result = await db.execute(
        select(Account).where(Account.telegram_user_id == user_id)
    )
    account = account_result.scalar_one_or_none()
    email: Optional[str] = account.email if account else None

    # Active subscription
    active_sub = await get_active_subscription_by_user_id(db, user_id)
    sub_detail: Optional[AdminSubscriptionDetail] = None
    if active_sub:
        sub_detail = AdminSubscriptionDetail(
            subscription_id=active_sub.subscription_id,
            is_active=active_sub.is_active,
            start_date=active_sub.start_date,
            end_date=active_sub.end_date,
            duration_months=active_sub.duration_months,
            provider=active_sub.provider,
            auto_renew_enabled=active_sub.auto_renew_enabled,
            traffic_limit_bytes=active_sub.traffic_limit_bytes,
            traffic_used_bytes=active_sub.traffic_used_bytes,
            panel_user_uuid=active_sub.panel_user_uuid,
        )

    # Recent payments (last 5)
    payments = await get_user_payments(db, user_id, limit=5, offset=0)
    payment_items = [
        AdminPaymentItem(
            payment_id=p.payment_id,
            amount=p.amount,
            currency=p.currency,
            status=p.status,
            provider=p.provider,
            created_at=p.created_at,
            subscription_duration_months=p.subscription_duration_months,
        )
        for p in payments
    ]

    total_paid = await get_user_total_paid(db, user_id)

    # Panel data (don't fail if panel is unavailable)
    panel_data = None
    if user.panel_user_uuid:
        try:
            panel = PanelApiService(settings)
            panel_data = await panel.get_user_by_uuid(user.panel_user_uuid)
        except Exception:
            panel_data = None

    return AdminUserDetailResponse(
        user_id=user.user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_banned=user.is_banned,
        registration_date=user.registration_date,
        panel_user_uuid=user.panel_user_uuid,
        language_code=user.language_code,
        referral_code=user.referral_code,
        email=email,
        subscription=sub_detail,
        recent_payments=payment_items,
        total_paid=total_paid,
        panel_data=panel_data,
    )


@router.post("/users/{user_id}/ban", dependencies=[Depends(admin_action_limit)])
async def ban_user(
    user_id: int,
    body: BanRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_user(db, user_id, {"is_banned": True})
    await add_admin_audit_log(db, admin, "admin_ban", target_user_id=user_id, details={"reason": body.reason})
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/unban", dependencies=[Depends(admin_action_limit)])
async def unban_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await update_user(db, user_id, {"is_banned": False})
    await add_admin_audit_log(db, admin, "admin_unban", target_user_id=user_id)
    await db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reset-trial", dependencies=[Depends(admin_action_limit)])
async def reset_user_trial(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from core.services.trial_core import reset_trial_for_user_identity

    reset_user_ids = await reset_trial_for_user_identity(
        db,
        user_id=user_id,
        reset_by_admin_id=admin.telegram_user_id,
    )
    from core.services.trial_core import check_trial_eligibility

    eligibility = await check_trial_eligibility(
        db,
        settings,
        telegram_user_id=user_id,
    )
    await add_admin_audit_log(
        db,
        admin,
        "admin_reset_trial",
        target_user_id=user_id,
        details={
            "reset_user_ids": reset_user_ids,
            "trial_eligible_after_reset": eligibility.eligible,
            "trial_block_reason": eligibility.reason,
        },
    )
    await db.commit()
    return {
        "ok": True,
        "reset_user_ids": reset_user_ids,
        "trial_eligible": eligibility.eligible,
        "trial_block_reason": eligibility.reason,
    }


@router.post("/users/{user_id}/add-days", dependencies=[Depends(admin_action_limit)])
async def add_days_to_subscription(
    user_id: int,
    body: AddDaysRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    if body.days <= 0:
        raise HTTPException(status_code=422, detail="days must be positive")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.panel_user_uuid:
        raise HTTPException(status_code=400, detail="User has no panel subscription")

    panel = PanelApiService(settings)
    success = await panel.extend_user_subscription(user.panel_user_uuid, body.days)
    if not success:
        raise HTTPException(status_code=502, detail="Panel API error")
    await add_admin_audit_log(db, admin, "admin_add_days", target_user_id=user_id, details={"days": body.days})
    await db.commit()
    return {"ok": True, "days_added": body.days}


@router.post("/users/{user_id}/add-traffic", dependencies=[Depends(admin_action_limit)])
async def add_traffic_to_user(
    user_id: int,
    body: AddTrafficRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    if body.gigabytes <= 0:
        raise HTTPException(status_code=422, detail="gigabytes must be positive")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.panel_user_uuid:
        raise HTTPException(status_code=400, detail="User has no panel subscription")

    bytes_to_add = int(body.gigabytes * 1024 ** 3)
    panel = PanelApiService(settings)
    success = await panel.add_user_traffic(user.panel_user_uuid, bytes_to_add)
    if not success:
        raise HTTPException(status_code=502, detail="Panel API error")
    await add_admin_audit_log(
        db, admin, "admin_add_traffic",
        target_user_id=user_id,
        details={"gigabytes": body.gigabytes},
    )
    await db.commit()
    return {"ok": True, "gigabytes_added": body.gigabytes}
