from fastapi import HTTPException, Request
from redis.asyncio import Redis


async def check_rate_limit(
    redis: Redis,
    key: str,
    max_requests: int,
    window_seconds: int,
) -> None:
    """
    Sliding window rate limiter using Redis INCR + EXPIRE.
    Raises HTTP 429 when limit exceeded.
    """
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    if current > max_requests:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
