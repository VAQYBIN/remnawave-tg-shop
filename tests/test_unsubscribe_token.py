"""HMAC-токены отписки от email-уведомлений (stdlib, без PyJWT в боте)."""
import uuid

from core.services.unsubscribe_token import (
    create_unsubscribe_token,
    verify_unsubscribe_token,
)

SECRET = "test-secret-key"


def test_roundtrip_returns_account_id():
    account_id = uuid.uuid4()
    token = create_unsubscribe_token(account_id, SECRET)
    assert verify_unsubscribe_token(token, SECRET) == account_id


def test_expired_token_is_rejected():
    token = create_unsubscribe_token(uuid.uuid4(), SECRET, expire_days=-1)
    assert verify_unsubscribe_token(token, SECRET) is None


def test_wrong_secret_is_rejected():
    token = create_unsubscribe_token(uuid.uuid4(), SECRET)
    assert verify_unsubscribe_token(token, "other-secret") is None


def test_garbage_token_is_rejected():
    assert verify_unsubscribe_token("not-a-token", SECRET) is None
    assert verify_unsubscribe_token("", SECRET) is None
