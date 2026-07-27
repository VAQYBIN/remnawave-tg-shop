"""Подписанные токены отписки от email-уведомлений.

Stdlib-реализация (hmac + base64) вместо PyJWT: токен создаётся в контейнере
бота, где PyJWT не установлен. Формат: urlsafe_b64("<uuid>:<exp_unix>:<hex_sig>").
"""
import base64
import hashlib
import hmac
import time
import uuid
from typing import Optional


def create_unsubscribe_token(
    account_id: uuid.UUID, secret: str, expire_days: int = 30
) -> str:
    exp = int(time.time()) + expire_days * 86400
    msg = f"{account_id}:{exp}"
    sig = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{msg}:{sig}".encode()).decode()


def verify_unsubscribe_token(token: str, secret: str) -> Optional[uuid.UUID]:
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        account_id_str, exp_str, sig = decoded.rsplit(":", 2)
        expected = hmac.new(
            secret.encode(), f"{account_id_str}:{exp_str}".encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        if int(exp_str) < time.time():
            return None
        return uuid.UUID(account_id_str)
    except Exception:
        return None
