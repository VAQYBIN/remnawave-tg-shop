import uuid
import random
import string
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update

from db.models import EmailVerificationCode

CODE_TTL_MINUTES = 10


def generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


async def create_verification_code(
    session: AsyncSession,
    email: str,
    purpose: str,
    account_id: Optional[uuid.UUID] = None,
    ttl_minutes: int = CODE_TTL_MINUTES,
) -> EmailVerificationCode:
    # Invalidate existing active codes for this email+purpose
    await session.execute(
        update(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email.lower(),
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.used == False,
        )
        .values(used=True)
    )

    code = generate_code()
    expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=ttl_minutes)

    record = EmailVerificationCode(
        account_id=account_id,
        email=email.lower(),
        code=code,
        purpose=purpose,
        expires_at=expires_at,
        used=False,
    )
    session.add(record)
    await session.flush()
    await session.refresh(record)
    return record


async def get_active_code(
    session: AsyncSession,
    email: str,
    purpose: str,
    code: str,
) -> Optional[EmailVerificationCode]:
    now = datetime.now(tz=timezone.utc)
    result = await session.execute(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email.lower(),
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.code == code,
            EmailVerificationCode.used == False,
            EmailVerificationCode.expires_at > now,
        )
    )
    return result.scalar_one_or_none()


async def mark_code_used(session: AsyncSession, code_id: int) -> None:
    await session.execute(
        update(EmailVerificationCode)
        .where(EmailVerificationCode.id == code_id)
        .values(used=True)
    )
    await session.flush()
