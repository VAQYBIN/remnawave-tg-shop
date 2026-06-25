import hmac
import hashlib
import json
import time
from urllib.parse import urlencode

import pytest

from web.auth.miniapp_auth import parse_and_validate_init_data


BOT_TOKEN = "123456:TEST_BOT_TOKEN_abcdef"


def _build_init_data(bot_token: str, auth_date: int, user: dict) -> str:
    """Construct a valid signed initData string the way Telegram would."""
    fields = {
        "auth_date": str(auth_date),
        "query_id": "AAH-test",
        "user": json.dumps(user, separators=(",", ":")),
    }
    data_check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": h})


def test_valid_init_data_returns_user():
    user = {"id": 777, "first_name": "Ann", "username": "ann", "language_code": "ru"}
    init_data = _build_init_data(BOT_TOKEN, int(time.time()), user)

    result = parse_and_validate_init_data(init_data, BOT_TOKEN)

    assert result["id"] == 777
    assert result["first_name"] == "Ann"
    assert result["username"] == "ann"
    assert result["language_code"] == "ru"


def test_bad_signature_rejected():
    user = {"id": 1}
    init_data = _build_init_data(BOT_TOKEN, int(time.time()), user)

    with pytest.raises(ValueError):
        parse_and_validate_init_data(init_data, "wrong:token")


def test_expired_auth_date_rejected():
    user = {"id": 1}
    old = int(time.time()) - 90000  # > default 86400s window
    init_data = _build_init_data(BOT_TOKEN, old, user)

    with pytest.raises(ValueError):
        parse_and_validate_init_data(init_data, BOT_TOKEN)


def test_missing_hash_rejected():
    with pytest.raises(ValueError):
        parse_and_validate_init_data("auth_date=1&user=%7B%7D", BOT_TOKEN)


def test_empty_init_data_rejected():
    with pytest.raises(ValueError):
        parse_and_validate_init_data("", BOT_TOKEN)
