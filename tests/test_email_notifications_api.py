"""API opt-out от email-уведомлений: PATCH /profile/notifications + unsubscribe."""
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import core.dal.account_dal as account_dal
from config.settings import get_settings
from core.services.unsubscribe_token import create_unsubscribe_token
from web.dependencies import get_current_account, get_db
from web.routers.profile import router as profile_router

SECRET = "test-secret-key"
ACCOUNT_ID = uuid.uuid4()


def make_account(**overrides):
    base = dict(
        id=ACCOUNT_ID,
        email="user@test.local",
        is_email_verified=True,
        email_notifications_enabled=True,
        language_code="ru",
        telegram_user_id=None,
        telegram_user=None,
        site_user_id=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(profile_router, prefix="/api")

    async def _override_get_db():
        yield None

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_account] = lambda: make_account()
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(
        WEB_JWT_SECRET=SECRET
    )
    return app


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_profile_includes_notifications_flag(client):
    resp = await client.get("/api/profile")
    assert resp.status_code == 200
    assert resp.json()["email_notifications_enabled"] is True


@pytest.mark.asyncio
async def test_patch_notifications_toggle(client, monkeypatch):
    calls = []

    async def fake_update(db, account_id, **kwargs):
        calls.append((account_id, kwargs))
        return None

    monkeypatch.setattr(account_dal, "update_account", fake_update)
    resp = await client.patch(
        "/api/profile/notifications",
        json={"email_notifications_enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json() == {"email_notifications_enabled": False}
    assert calls == [(ACCOUNT_ID, {"email_notifications_enabled": False})]


@pytest.mark.asyncio
async def test_unsubscribe_with_valid_token(client, monkeypatch):
    calls = []

    async def fake_get_account(db, account_id):
        return make_account()

    async def fake_update(db, account_id, **kwargs):
        calls.append((account_id, kwargs))
        return None

    monkeypatch.setattr(account_dal, "get_account_by_id", fake_get_account)
    monkeypatch.setattr(account_dal, "update_account", fake_update)

    token = create_unsubscribe_token(ACCOUNT_ID, SECRET)
    resp = await client.get(f"/api/profile/unsubscribe?token={token}")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert calls == [(ACCOUNT_ID, {"email_notifications_enabled": False})]


@pytest.mark.asyncio
async def test_unsubscribe_with_invalid_token(client):
    resp = await client.get("/api/profile/unsubscribe?token=garbage")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_unsubscribe_with_expired_token(client):
    token = create_unsubscribe_token(ACCOUNT_ID, SECRET, expire_days=-1)
    resp = await client.get(f"/api/profile/unsubscribe?token={token}")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_unsubscribe_unknown_account(client, monkeypatch):
    async def fake_get_account(db, account_id):
        return None

    monkeypatch.setattr(account_dal, "get_account_by_id", fake_get_account)
    token = create_unsubscribe_token(ACCOUNT_ID, SECRET)
    resp = await client.get(f"/api/profile/unsubscribe?token={token}")
    assert resp.status_code == 400
