"""Validation of Telegram Mini App ``initData``.

When the web cabinet is opened as a Telegram Mini App, Telegram exposes the raw
``window.Telegram.WebApp.initData`` query string. The bot's backend must verify
its integrity (HMAC-SHA256 with a key derived from ``BOT_TOKEN``) before trusting
any of its fields — see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hmac
import hashlib
import json
import logging
import time
from typing import Optional
from urllib.parse import parse_qsl

logger = logging.getLogger(__name__)


def parse_and_validate_init_data(
    init_data: str,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> dict:
    """Verify Telegram Mini App initData and return the embedded user dict.

    Algorithm (per Telegram docs):
      1. Parse the query string into key/value pairs.
      2. Pop ``hash``; build ``data_check_string`` from the remaining pairs sorted
         alphabetically, joined as ``key=value`` by newlines.
      3. ``secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)``.
      4. ``calc = HMAC_SHA256(key=secret_key, msg=data_check_string)`` — compare to ``hash``.
      5. Reject stale ``auth_date`` (older than ``max_age_seconds``).

    Returns a dict with ``id, first_name, last_name, username, language_code``.
    Raises ``ValueError`` on any failure (bad signature, missing/expired data).
    """
    if not init_data:
        raise ValueError("Empty initData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise ValueError("initData has no hash")

    data_check_string = "\n".join(
        f"{key}={pairs[key]}" for key in sorted(pairs.keys())
    )

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("initData hash mismatch")

    # Freshness check — prevents replay of an old, leaked initData.
    auth_date_raw = pairs.get("auth_date")
    if not auth_date_raw:
        raise ValueError("initData has no auth_date")
    try:
        auth_date = int(auth_date_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("initData auth_date is not an integer") from exc
    if time.time() - auth_date > max_age_seconds:
        raise ValueError("initData is expired")

    user_raw = pairs.get("user")
    if not user_raw:
        raise ValueError("initData has no user field")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise ValueError("initData user field is not valid JSON") from exc

    user_id = user.get("id")
    if not isinstance(user_id, int):
        raise ValueError("initData user has no integer id")

    return {
        "id": user_id,
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "username": user.get("username"),
        "language_code": user.get("language_code"),
    }
