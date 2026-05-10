import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import TrialActivation, TrialResetGrant


def _identity_filter(
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
):
    conditions = []
    if account_id is not None:
        conditions.append(TrialActivation.account_id == account_id)
    if user_ids:
        conditions.append(TrialActivation.user_id.in_(user_ids))
        conditions.append(TrialActivation.telegram_user_id.in_(user_ids))
        conditions.append(TrialActivation.site_user_id.in_(user_ids))
    if telegram_user_id is not None:
        conditions.append(TrialActivation.telegram_user_id == telegram_user_id)
        conditions.append(TrialActivation.user_id == telegram_user_id)
    if site_user_id is not None:
        conditions.append(TrialActivation.site_user_id == site_user_id)
        conditions.append(TrialActivation.user_id == site_user_id)
    if not conditions:
        return None
    return or_(*conditions)


def _identity_filter_for_model(
    model,
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
):
    conditions = []
    if account_id is not None:
        conditions.append(model.account_id == account_id)
    if user_ids:
        conditions.append(model.user_id.in_(user_ids))
        conditions.append(model.telegram_user_id.in_(user_ids))
        conditions.append(model.site_user_id.in_(user_ids))
    if telegram_user_id is not None:
        conditions.append(model.telegram_user_id == telegram_user_id)
        conditions.append(model.user_id == telegram_user_id)
    if site_user_id is not None:
        conditions.append(model.site_user_id == site_user_id)
        conditions.append(model.user_id == site_user_id)
    if not conditions:
        return None
    return or_(*conditions)


async def has_active_trial_activation(
    session: AsyncSession,
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
) -> bool:
    identity = _identity_filter(
        account_id=account_id,
        user_ids=user_ids,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
    )
    if identity is None:
        return False

    stmt = (
        select(TrialActivation.id)
        .where(TrialActivation.reset_at.is_(None), identity)
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


async def create_trial_activation(
    session: AsyncSession,
    *,
    user_id: int,
    source: str,
    account_id: Optional[uuid.UUID] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
) -> TrialActivation:
    activation = TrialActivation(
        account_id=account_id,
        user_id=user_id,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
        source=source,
    )
    session.add(activation)
    await session.flush()
    await session.refresh(activation)
    return activation


async def attach_account_identity_to_telegram_trials(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    telegram_user_id: int,
    site_user_id: Optional[int],
) -> int:
    values = {"account_id": account_id, "telegram_user_id": telegram_user_id}
    if site_user_id is not None:
        values["site_user_id"] = site_user_id

    stmt = (
        update(TrialActivation)
        .where(
            TrialActivation.reset_at.is_(None),
            or_(
                TrialActivation.telegram_user_id == telegram_user_id,
                TrialActivation.user_id == telegram_user_id,
            ),
        )
        .values(**values)
    )
    result = await session.execute(stmt)
    return result.rowcount or 0


async def attach_telegram_identity_to_account_trials(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    telegram_user_id: int,
    site_user_id: Optional[int],
) -> int:
    conditions = [TrialActivation.account_id == account_id]
    if site_user_id is not None:
        conditions.extend(
            [
                TrialActivation.site_user_id == site_user_id,
                TrialActivation.user_id == site_user_id,
            ]
        )

    stmt = (
        update(TrialActivation)
        .where(TrialActivation.reset_at.is_(None), or_(*conditions))
        .values(telegram_user_id=telegram_user_id, account_id=account_id)
    )
    result = await session.execute(stmt)
    return result.rowcount or 0


async def reset_trial_activations(
    session: AsyncSession,
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
    reset_by_admin_id: Optional[int] = None,
) -> int:
    identity = _identity_filter(
        account_id=account_id,
        user_ids=user_ids,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
    )
    if identity is None:
        return 0

    stmt = (
        update(TrialActivation)
        .where(TrialActivation.reset_at.is_(None), identity)
        .values(
            reset_at=datetime.now(timezone.utc),
            reset_by_admin_id=reset_by_admin_id,
        )
    )
    result = await session.execute(stmt)
    return result.rowcount or 0


async def has_unused_trial_reset_grant(
    session: AsyncSession,
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
) -> bool:
    identity = _identity_filter_for_model(
        TrialResetGrant,
        account_id=account_id,
        user_ids=user_ids,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
    )
    if identity is None:
        return False

    result = await session.execute(
        select(TrialResetGrant.id)
        .where(TrialResetGrant.used_at.is_(None), identity)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def create_trial_reset_grant(
    session: AsyncSession,
    *,
    user_id: int,
    account_id: Optional[uuid.UUID] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
    granted_by_admin_id: Optional[int] = None,
) -> TrialResetGrant:
    identity = _identity_filter_for_model(
        TrialResetGrant,
        account_id=account_id,
        user_ids=[user_id],
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
    )
    if identity is not None:
        existing = await session.execute(
            select(TrialResetGrant)
            .where(TrialResetGrant.used_at.is_(None), identity)
            .limit(1)
        )
        grant = existing.scalar_one_or_none()
        if grant:
            grant.account_id = account_id
            grant.user_id = user_id
            grant.telegram_user_id = telegram_user_id
            grant.site_user_id = site_user_id
            grant.granted_by_admin_id = granted_by_admin_id
            grant.granted_at = datetime.now(timezone.utc)
            await session.flush()
            await session.refresh(grant)
            return grant

    grant = TrialResetGrant(
        account_id=account_id,
        user_id=user_id,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
        granted_by_admin_id=granted_by_admin_id,
    )
    session.add(grant)
    await session.flush()
    await session.refresh(grant)
    return grant


async def consume_trial_reset_grants(
    session: AsyncSession,
    *,
    account_id: Optional[uuid.UUID] = None,
    user_ids: Optional[list[int]] = None,
    telegram_user_id: Optional[int] = None,
    site_user_id: Optional[int] = None,
) -> int:
    identity = _identity_filter_for_model(
        TrialResetGrant,
        account_id=account_id,
        user_ids=user_ids,
        telegram_user_id=telegram_user_id,
        site_user_id=site_user_id,
    )
    if identity is None:
        return 0

    result = await session.execute(
        update(TrialResetGrant)
        .where(TrialResetGrant.used_at.is_(None), identity)
        .values(used_at=datetime.now(timezone.utc))
    )
    return result.rowcount or 0
