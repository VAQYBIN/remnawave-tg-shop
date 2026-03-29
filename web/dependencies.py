import uuid
from typing import AsyncGenerator, Optional

import jwt
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from config.settings import Settings, get_settings
from fastapi import Depends, Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from redis.asyncio import Redis

from db.models import Account

_async_session_factory = None
_bearer_scheme = HTTPBearer(auto_error=False)


def _get_session_factory():
    global _async_session_factory
    if _async_session_factory is None:
        settings = get_settings()
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
        )
        _async_session_factory = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_settings_dep() -> Settings:
    return get_settings()


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


async def get_current_account(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> Account:
    """FastAPI dependency: decode access token and return the Account."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not settings.WEB_JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT not configured")

    from web.auth.jwt_service import verify_access_token
    try:
        payload = verify_access_token(credentials.credentials, settings.WEB_JWT_SECRET)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    account_id_str = payload.get("sub")
    if not account_id_str:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        account_id = uuid.UUID(account_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid account ID in token")

    from core.dal.account_dal import get_account_by_id
    account = await get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=401, detail="Account not found")

    return account
