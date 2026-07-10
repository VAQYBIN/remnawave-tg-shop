import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
import fakeredis.aioredis
import redis.asyncio as redis_async
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from web.auth.router import router as auth_router
from web.dependencies import get_db, get_redis, get_settings_dep


@pytest.fixture
def test_settings():
    # secure=False для cookie (WEB_API_URL начинается с http://localhost);
    # RESEND_API_KEY пуст → send-code не ходит в Resend.
    return SimpleNamespace(
        RESEND_API_KEY="",
        RESEND_FROM_EMAIL="noreply@test.local",
        WEB_JWT_SECRET="test-secret-key",
        WEB_JWT_ACCESS_EXPIRE_MINUTES=15,
        WEB_JWT_REFRESH_EXPIRE_DAYS=7,
        WEB_API_URL="http://localhost",
    )


@pytest_asyncio.fixture
async def fake_redis():
    # protocol=2 (RESP2) вручную через ConnectionPool: installed redis-py (8.x)
    # by default negotiates RESP3 via a HELLO handshake on connect, which
    # fakeredis 2.26.2 does not implement ("unknown command `hello`").
    # Forcing RESP2 skips that handshake; fakeredis.FakeRedis(..., protocol=2)
    # alone does not work because FakeRedis builds its own connection_kwargs
    # internally and does not forward an unrecognized `protocol` kwarg to them.
    connection_kwargs = dict(
        host=uuid.uuid4().hex,
        port=6379,
        db=0,
        decode_responses=True,
        connection_class=fakeredis.aioredis.FakeConnection,
        protocol=2,
    )
    pool = redis_async.ConnectionPool(**connection_kwargs)
    r = fakeredis.aioredis.FakeRedis(connection_pool=pool, decode_responses=True)
    try:
        yield r
    finally:
        await r.aclose()


@pytest.fixture
def email_app(test_settings, fake_redis):
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    async def _override_get_db():
        yield None  # DAL-функции в тестах замоканы, сессия не используется

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_settings_dep] = lambda: test_settings
    return app


@pytest_asyncio.fixture
async def client(email_app):
    transport = ASGITransport(app=email_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
