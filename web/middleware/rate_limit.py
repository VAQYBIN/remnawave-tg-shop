import uuid
from fastapi import Depends, HTTPException, Request
from redis.asyncio import Redis

from db.models import Account
from web.dependencies import get_current_admin, get_redis


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
    # X-Real-IP is set by nginx from $remote_addr and cannot be spoofed by clients
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


class AdminActionRateLimit:
    """Reusable dependency for rate-limiting admin action endpoints."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(
        self,
        request: Request,
        admin: Account = Depends(get_current_admin),
        redis: Redis = Depends(get_redis),
    ) -> None:
        endpoint = request.url.path.replace("/", "_")
        key = f"rl:admin:{admin.id}:{endpoint}"
        await check_rate_limit(redis, key, self.max_requests, self.window_seconds)


# Pre-configured limiters
admin_action_limit = AdminActionRateLimit(max_requests=60, window_seconds=60)
admin_broadcast_limit = AdminActionRateLimit(max_requests=5, window_seconds=3600)
