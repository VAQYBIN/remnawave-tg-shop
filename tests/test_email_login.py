import uuid

import web.auth.router as auth_mod

import pytest


def _fake_account(email="user@mail.com", is_email_verified=True):
    return type("Acc", (), {
        "id": uuid.uuid4(),
        "email": email,
        "is_email_verified": is_email_verified,
        "language_code": "ru",
    })()


def _patch_verify_deps(monkeypatch, code_record, existing_account):
    async def fake_get_active_code(session, email, purpose, code):
        return code_record

    async def fake_mark_used(session, code_id):
        return None

    async def fake_get_by_email(session, email):
        return existing_account

    created_holder = {}

    async def fake_create_account(session, email, is_email_verified=False, **kw):
        acc = _fake_account(email=email, is_email_verified=is_email_verified)
        created_holder["acc"] = acc
        return acc

    async def fake_update_account(session, account_id, **kwargs):
        acc = existing_account
        for k, v in kwargs.items():
            setattr(acc, k, v)
        return acc

    monkeypatch.setattr(auth_mod, "get_active_code", fake_get_active_code)
    monkeypatch.setattr(auth_mod, "mark_code_used", fake_mark_used)
    monkeypatch.setattr(auth_mod, "get_account_by_email", fake_get_by_email)
    monkeypatch.setattr(auth_mod, "create_account", fake_create_account)
    monkeypatch.setattr(auth_mod, "update_account", fake_update_account)
    # заглушить best-effort нотификацию группы (импортируется внутри функции)
    import core.services.telegram_notify as notify_mod

    async def _noop(*a, **kw):
        return None

    monkeypatch.setattr(notify_mod, "notify_group_web_registration", _noop)
    return created_holder


@pytest.mark.asyncio
async def test_send_code_returns_neutral_message_and_uses_login_purpose(client, monkeypatch):
    calls = {}

    async def fake_create_code(session, email, purpose, **kw):
        calls["email"] = email
        calls["purpose"] = purpose
        return type("Rec", (), {"code": "123456"})()

    monkeypatch.setattr(auth_mod, "create_verification_code", fake_create_code)

    resp = await client.post("/api/auth/email/send-code", json={"email": "User@Mail.com"})

    assert resp.status_code == 200
    assert resp.json() == {"message": "Код отправлен на email"}
    assert calls["purpose"] == "login"
    assert calls["email"] == "user@mail.com"


@pytest.mark.asyncio
async def test_send_code_rate_limited_on_sixth(client, monkeypatch):
    async def fake_create_code(session, email, purpose, **kw):
        return type("Rec", (), {"code": "123456"})()

    monkeypatch.setattr(auth_mod, "create_verification_code", fake_create_code)

    last = None
    for _ in range(6):
        last = await client.post("/api/auth/email/send-code", json={"email": "a@b.io"})
    assert last.status_code == 429


@pytest.mark.asyncio
async def test_verify_new_email_creates_account_and_sets_cookie(client, monkeypatch):
    code_record = type("Rec", (), {"id": 1})()
    _patch_verify_deps(monkeypatch, code_record=code_record, existing_account=None)

    resp = await client.post(
        "/api/auth/email/verify",
        json={"email": "New@Mail.com", "code": "123456"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "new@mail.com"
    assert data["is_email_verified"] is True
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_verify_existing_account_logs_in_same_id(client, monkeypatch):
    existing = _fake_account(email="old@mail.com", is_email_verified=False)
    code_record = type("Rec", (), {"id": 2})()
    _patch_verify_deps(monkeypatch, code_record=code_record, existing_account=existing)

    resp = await client.post(
        "/api/auth/email/verify",
        json={"email": "old@mail.com", "code": "000111"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["account_id"] == str(existing.id)
    assert data["is_email_verified"] is True  # был False → проставлен


@pytest.mark.asyncio
async def test_verify_bad_code_returns_400(client, monkeypatch):
    _patch_verify_deps(monkeypatch, code_record=None, existing_account=None)

    resp = await client.post(
        "/api/auth/email/verify",
        json={"email": "a@b.io", "code": "999999"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Неверный или истёкший код"
