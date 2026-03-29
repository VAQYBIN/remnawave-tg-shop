import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from redis.asyncio import Redis

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
REDIS_REFRESH_PREFIX = "refresh_token:"


def create_access_token(account_id: uuid.UUID, secret: str, expire_minutes: int) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(account_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def create_refresh_token(account_id: uuid.UUID, secret: str, expire_days: int) -> tuple[str, str]:
    """Returns (token, jti)."""
    now = datetime.now(tz=timezone.utc)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(account_id),
        "type": REFRESH_TOKEN_TYPE,
        "jti": jti,
        "iat": now,
        "exp": now + timedelta(days=expire_days),
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    return token, jti


def decode_token(token: str, secret: str) -> dict:
    """Decode and verify token. Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def verify_access_token(token: str, secret: str) -> dict:
    payload = decode_token(token, secret)
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Not an access token")
    return payload


async def verify_refresh_token(token: str, secret: str, redis: Redis) -> dict:
    """Decode refresh token and confirm jti exists in Redis."""
    payload = decode_token(token, secret)
    if payload.get("type") != REFRESH_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Not a refresh token")
    jti = payload.get("jti")
    if not jti:
        raise jwt.InvalidTokenError("Missing jti")
    stored = await redis.get(f"{REDIS_REFRESH_PREFIX}{jti}")
    if stored is None:
        raise jwt.InvalidTokenError("Refresh token revoked or not found")
    return payload


async def store_refresh_token(
    jti: str,
    account_id: uuid.UUID,
    redis: Redis,
    expire_days: int,
) -> None:
    key = f"{REDIS_REFRESH_PREFIX}{jti}"
    ttl = int(timedelta(days=expire_days).total_seconds())
    await redis.setex(key, ttl, str(account_id))


async def revoke_refresh_token(jti: str, redis: Redis) -> None:
    await redis.delete(f"{REDIS_REFRESH_PREFIX}{jti}")


async def rotate_refresh_token(
    old_jti: str,
    account_id: uuid.UUID,
    secret: str,
    expire_days: int,
    redis: Redis,
) -> tuple[str, str]:
    """Revoke old refresh token and issue a new one. Returns (new_token, new_jti)."""
    await revoke_refresh_token(old_jti, redis)
    new_token, new_jti = create_refresh_token(account_id, secret, expire_days)
    await store_refresh_token(new_jti, account_id, redis, expire_days)
    return new_token, new_jti
