import web.auth.router as auth_mod

import pytest


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
