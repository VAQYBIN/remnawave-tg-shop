import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update

from db.models import Account


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
