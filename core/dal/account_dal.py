import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, func

from db.models import Account, User


def web_panel_username(account: Account) -> str:
    """Stable, non-enumerable panel username for a web-only account.

    Derived from the account's UUID (the analogue of a Telegram ID for web
    users): globally unique, not sequential, so it neither leaks the total
    web-user count nor lets one username be guessed from another. 12 hex chars
    (48 bits) make collisions negligible, and the panel rejects duplicates
    (errorCode A019) as a backstop.
    """
    return f"web_{account.id.hex[:12]}"


async def get_account_by_id(session: AsyncSession, account_id: uuid.UUID) -> Optional[Account]:
    result = await session.execute(select(Account).where(Account.id == account_id))
    return result.scalar_one_or_none()


async def get_account_by_email(session: AsyncSession, email: str) -> Optional[Account]:
    result = await session.execute(select(Account).where(Account.email == email.lower()))
    return result.scalar_one_or_none()


async def get_account_by_telegram_id(session: AsyncSession, telegram_user_id: int) -> Optional[Account]:
    result = await session.execute(
        select(Account).where(Account.telegram_user_id == telegram_user_id)
    )
    return result.scalar_one_or_none()


async def get_account_by_site_user_id(session: AsyncSession, site_user_id: int) -> Optional[Account]:
    result = await session.execute(
        select(Account).where(Account.site_user_id == site_user_id)
    )
    return result.scalar_one_or_none()


async def create_account(
    session: AsyncSession,
    email: Optional[str] = None,
    password_hash: Optional[str] = None,
    telegram_user_id: Optional[int] = None,
    is_email_verified: bool = False,
    language_code: str = "ru",
) -> Account:
    account = Account(
        id=uuid.uuid4(),
        email=email.lower() if email else None,
        password_hash=password_hash,
        telegram_user_id=telegram_user_id,
        is_email_verified=is_email_verified,
        language_code=language_code,
    )
    session.add(account)
    await session.flush()
    await session.refresh(account)
    return account


async def _next_site_user_id(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.min(User.user_id)).where(User.user_id < 0)
    )
    min_existing = result.scalar_one_or_none()
    if min_existing is None:
        return -1
    return int(min_existing) - 1


async def ensure_site_user_for_account(session: AsyncSession, account: Account) -> User:
    if account.site_user_id is not None:
        existing = await session.get(User, account.site_user_id)
        if existing:
            return existing

    from core.dal.user_dal import create_user

    for _ in range(5):
        user_id = await _next_site_user_id(session)
        user, created = await create_user(
            session,
            {
                "user_id": user_id,
                "username": web_panel_username(account),
                "first_name": account.email,
                "language_code": account.language_code or "ru",
            },
        )
        if user:
            if not created:
                owner = await get_account_by_site_user_id(session, user.user_id)
                if owner and owner.id != account.id:
                    continue
            account.site_user_id = user.user_id
            await session.flush()
            await session.refresh(account)
            return user
        if not created:
            continue

    raise RuntimeError("Failed to allocate site user for account")


def get_account_user_ids(account: Account) -> list[int]:
    ids: list[int] = []
    if account.telegram_user_id is not None:
        ids.append(int(account.telegram_user_id))
    if account.site_user_id is not None and int(account.site_user_id) not in ids:
        ids.append(int(account.site_user_id))
    return ids


async def get_effective_payment_user_id(session: AsyncSession, account: Account) -> int:
    if account.telegram_user_id is not None:
        return int(account.telegram_user_id)
    site_user = await ensure_site_user_for_account(session, account)
    return int(site_user.user_id)


async def update_account(
    session: AsyncSession,
    account_id: uuid.UUID,
    **kwargs,
) -> Optional[Account]:
    if "email" in kwargs and kwargs["email"]:
        kwargs["email"] = kwargs["email"].lower()
    await session.execute(
        update(Account).where(Account.id == account_id).values(**kwargs)
    )
    await session.flush()
    return await get_account_by_id(session, account_id)
