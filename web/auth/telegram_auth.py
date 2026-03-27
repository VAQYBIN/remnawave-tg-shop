import logging
from typing import Optional

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

logger = logging.getLogger(__name__)

TELEGRAM_TOKEN_ENDPOINT = "https://oauth.telegram.org/token"
TELEGRAM_JWKS_URI = "https://oauth.telegram.org/.well-known/jwks.json"
TELEGRAM_ISSUER = "https://oauth.telegram.org"


async def exchange_code_for_tokens(
    code: str,
    code_verifier: str,
    redirect_uri: str,
    bot_id: int,
    client_secret: str,
) -> dict:
    """Exchange PKCE authorization code for tokens at Telegram's token endpoint."""
    import base64
    credentials = base64.b64encode(f"{bot_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            TELEGRAM_TOKEN_ENDPOINT,
            headers={"Authorization": f"Basic {credentials}"},
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
                "client_id": str(bot_id),
            },
        )
        if not resp.is_success:
            logger.warning(
                "Telegram token endpoint error: status=%s body=%r",
                resp.status_code,
                resp.text[:1000],
            )
            resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(f"Telegram token error: {data['error']} — {data.get('error_description', '')}")
        return data


async def _fetch_jwks() -> list:
    """Fetch current public keys from Telegram's JWKS endpoint."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(TELEGRAM_JWKS_URI)
        resp.raise_for_status()
        return resp.json()["keys"]


async def verify_id_token(id_token: str, bot_id: int) -> dict:
    """
    Verify Telegram OIDC id_token:
    1. Fetch JWKS from Telegram
    2. Find the matching public key by `kid`
    3. Decode and verify JWT (issuer, audience, expiry)
    Returns the verified claims dict.
    """
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.exceptions.DecodeError as exc:
        raise ValueError(f"Cannot decode id_token header: {exc}") from exc

    kid = header.get("kid")
    alg = header.get("alg", "RS256")

    jwks_keys = await _fetch_jwks()

    signing_key = None
    for key_data in jwks_keys:
        if kid and key_data.get("kid") != kid:
            continue
        signing_key = RSAAlgorithm.from_jwk(key_data)
        break

    if signing_key is None:
        raise ValueError(f"No matching JWKS key found for kid={kid!r}")

    claims = jwt.decode(
        id_token,
        signing_key,
        algorithms=[alg],
        audience=str(bot_id),
        issuer=TELEGRAM_ISSUER,
    )
    return claims


def extract_telegram_user_id(claims: dict) -> Optional[int]:
    """
    Extract the real Telegram user ID from id_token claims.

    Telegram OIDC `sub` is a uint64 pairwise identifier that overflows PostgreSQL BIGINT.
    The actual user ID is returned in the `id` or `telegram_id` claim of the id_token.
    """
    INT64_MAX = 2**63 - 1

    for field in ("telegram_id", "id", "tg_id"):
        val = claims.get(field)
        if val is not None:
            try:
                uid = int(val)
                if 0 < uid <= INT64_MAX:
                    return uid
            except (TypeError, ValueError):
                continue

    logger.warning("Could not find valid Telegram user ID in claims. keys=%s", list(claims.keys()))
    return None
