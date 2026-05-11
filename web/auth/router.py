import uuid
import logging
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from web.dependencies import get_db, get_settings_dep, get_redis
from web.schemas.auth import (
    TelegramCallbackRequest,
    RegisterSendCodeRequest,
    RegisterVerifyRequest,
    CheckCodeRequest,
    LoginRequest,
    SendResetCodeRequest,
    ResetPasswordRequest,
    TokenResponse,
    MessageResponse,
    TelegramConfigResponse,
)
from web.auth import jwt_service
from web.auth.telegram_auth import (
    exchange_code_for_tokens,
    verify_id_token,
    extract_telegram_user_id,
)
from web.auth.email_service import send_verification_code
from web.auth.password import hash_password, verify_password
from web.middleware.rate_limit import check_rate_limit, get_client_ip
from core.dal.account_dal import (
    get_account_by_email,
    get_account_by_telegram_id,
    create_account,
    update_account,
)
from core.dal.email_verification_code_dal import (
    create_verification_code,
    get_active_code,
    mark_code_used,
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds


def _set_refresh_cookie(response: Response, token: str, secure: bool = True) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/auth",
    )


async def _issue_tokens(
    account_id: uuid.UUID,
    settings: Settings,
    redis,
    response: Response,
) -> dict:
    access_token = jwt_service.create_access_token(
        account_id=account_id,
        secret=settings.WEB_JWT_SECRET,
        expire_minutes=settings.WEB_JWT_ACCESS_EXPIRE_MINUTES,
    )
    refresh_token, jti = jwt_service.create_refresh_token(
        account_id=account_id,
        secret=settings.WEB_JWT_SECRET,
        expire_days=settings.WEB_JWT_REFRESH_EXPIRE_DAYS,
    )
    await jwt_service.store_refresh_token(
        jti=jti,
        account_id=account_id,
        redis=redis,
        expire_days=settings.WEB_JWT_REFRESH_EXPIRE_DAYS,
    )
    # Use secure=False only in local dev (no HTTPS)
    secure = not settings.WEB_API_URL.startswith("http://localhost")
    _set_refresh_cookie(response, refresh_token, secure=secure)
    return {"access_token": access_token}


# ─── GET /auth/telegram/config ──────────────────────────────────────────────

@router.get("/telegram/config", response_model=TelegramConfigResponse)
async def get_telegram_config(settings: Settings = Depends(get_settings_dep)):
    if not settings.telegram_client_id:
        raise HTTPException(status_code=503, detail="Telegram login is not configured")
    return TelegramConfigResponse(client_id=settings.telegram_client_id)


# ─── POST /auth/telegram ────────────────────────────────────────────────────

@router.post("/telegram", response_model=TokenResponse)
async def auth_telegram(
    request: Request,
    response: Response,
    data: TelegramCallbackRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:tg:{ip}", max_requests=10, window_seconds=60)

    if not settings.telegram_client_id:
        raise HTTPException(status_code=503, detail="Telegram login is not configured")
    if not settings.TELEGRAM_OIDC_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Telegram OIDC client secret is not configured")

    try:
        tg_tokens = await exchange_code_for_tokens(
            code=data.code,
            code_verifier=data.code_verifier,
            redirect_uri=data.redirect_uri,
            bot_id=settings.telegram_client_id,
            client_secret=settings.TELEGRAM_OIDC_CLIENT_SECRET,
        )
    except Exception as exc:
        logger.warning("Telegram token exchange failed: %s", exc)
        raise HTTPException(status_code=401, detail="Telegram authentication failed")

    id_token = tg_tokens.get("id_token")
    if not id_token:
        raise HTTPException(status_code=401, detail="No id_token in Telegram response")

    try:
        claims = await verify_id_token(id_token, settings.telegram_client_id)
    except Exception as exc:
        logger.warning("Telegram id_token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Telegram id_token")

    tg_user_id = extract_telegram_user_id(claims)
    if not tg_user_id:
        raise HTTPException(status_code=400, detail="Missing Telegram user ID in token claims")

    account = await get_account_by_telegram_id(db, tg_user_id)
    if not account:
        # Ensure a users row exists (FK requirement) — the user may not have used the bot yet
        from core.dal.user_dal import get_user_by_id, create_user
        existing_user = await get_user_by_id(db, tg_user_id)
        if not existing_user:
            language_code = claims.get("language_code") or "ru"
            await create_user(db, {
                "user_id": tg_user_id,
                "username": claims.get("username"),
                "first_name": claims.get("first_name"),
                "last_name": claims.get("last_name"),
                "language_code": language_code,
            })

        language_code = claims.get("language_code") or "ru"
        account = await create_account(
            db,
            telegram_user_id=tg_user_id,
            is_email_verified=False,
            language_code=language_code,
        )

    tokens = await _issue_tokens(account.id, settings, redis, response)

    return TokenResponse(
        access_token=tokens["access_token"],
        account_id=account.id,
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
    )


# ─── POST /auth/register/send-code ─────────────────────────────────────────

@router.post("/register/send-code", response_model=MessageResponse)
async def register_send_code(
    request: Request,
    body: RegisterSendCodeRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:reg:{ip}", max_requests=5, window_seconds=300)

    existing = await get_account_by_email(db, body.email)
    if existing and existing.is_email_verified:
        # Don't reveal that account exists — return same message
        logger.warning("Registration attempt for existing verified email: %s", body.email)
        return MessageResponse(message="Код отправлен на email, если он не зарегистрирован")

    code_record = await create_verification_code(db, email=body.email, purpose="register")

    if settings.RESEND_API_KEY:
        from core.dal.site_settings_dal import get_site_settings
        site_settings = await get_site_settings(db)
        await send_verification_code(
            email=body.email,
            code=code_record.code,
            purpose="register",
            api_key=settings.RESEND_API_KEY,
            from_email=settings.RESEND_FROM_EMAIL,
            brand=site_settings.brand_name,
        )
    else:
        logger.warning("RESEND_API_KEY not set — skipping email send for %s", body.email)

    return MessageResponse(message="Код отправлен на email, если он не зарегистрирован")


# ─── POST /auth/register/check-code ─────────────────────────────────────────

@router.post("/register/check-code", response_model=MessageResponse)
async def register_check_code(
    request: Request,
    body: CheckCodeRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:check:{ip}", max_requests=10, window_seconds=300)

    code_record = await get_active_code(db, email=body.email, purpose="register", code=body.code)
    if not code_record:
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    return MessageResponse(message="Код подтверждён")


# ─── POST /auth/register/verify ─────────────────────────────────────────────

@router.post("/register/verify", response_model=TokenResponse)
async def register_verify(
    request: Request,
    response: Response,
    body: RegisterVerifyRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:verify:{ip}", max_requests=10, window_seconds=300)

    code_record = await get_active_code(db, email=body.email, purpose="register", code=body.code)
    if not code_record:
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    await mark_code_used(db, code_record.id)

    existing = await get_account_by_email(db, body.email)
    if existing:
        # Account existed but wasn't verified — update password and verify
        account = await update_account(
            db,
            account_id=existing.id,
            password_hash=hash_password(body.password),
            is_email_verified=True,
        )
    else:
        account = await create_account(
            db,
            email=body.email,
            password_hash=hash_password(body.password),
            is_email_verified=True,
        )

    tokens = await _issue_tokens(account.id, settings, redis, response)

    return TokenResponse(
        access_token=tokens["access_token"],
        account_id=account.id,
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
    )


# ─── POST /auth/login ────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:login:{ip}", max_requests=10, window_seconds=60)

    account = await get_account_by_email(db, body.email)
    if not account or not account.password_hash:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not verify_password(body.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not account.is_email_verified:
        raise HTTPException(status_code=403, detail="Email не подтверждён")

    tokens = await _issue_tokens(account.id, settings, redis, response)

    return TokenResponse(
        access_token=tokens["access_token"],
        account_id=account.id,
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
    )


# ─── POST /auth/password/send-reset-code ─────────────────────────────────────

@router.post("/password/send-reset-code", response_model=MessageResponse)
async def password_send_reset_code(
    request: Request,
    body: SendResetCodeRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:reset:{ip}", max_requests=5, window_seconds=300)

    account = await get_account_by_email(db, body.email)
    if account and account.is_email_verified:
        code_record = await create_verification_code(
            db, email=body.email, purpose="reset_password", account_id=account.id
        )
        if settings.RESEND_API_KEY:
            from core.dal.site_settings_dal import get_site_settings
            site_settings = await get_site_settings(db)
            await send_verification_code(
                email=body.email,
                code=code_record.code,
                purpose="reset_password",
                api_key=settings.RESEND_API_KEY,
                from_email=settings.RESEND_FROM_EMAIL,
                brand=site_settings.brand_name,
            )
        else:
            logger.warning("RESEND_API_KEY not set — skipping email send for %s", body.email)

    return MessageResponse(message="Если этот email зарегистрирован, на него отправлен код")


# ─── POST /auth/password/check-reset-code ────────────────────────────────────

@router.post("/password/check-reset-code", response_model=MessageResponse)
async def password_check_reset_code(
    request: Request,
    body: CheckCodeRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:check:{ip}", max_requests=10, window_seconds=300)

    code_record = await get_active_code(
        db, email=body.email, purpose="reset_password", code=body.code
    )
    if not code_record:
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    return MessageResponse(message="Код подтверждён")


# ─── POST /auth/password/reset ───────────────────────────────────────────────

@router.post("/password/reset", response_model=MessageResponse)
async def password_reset(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    ip = get_client_ip(request)
    await check_rate_limit(redis, f"rl:auth:reset_verify:{ip}", max_requests=10, window_seconds=300)

    code_record = await get_active_code(
        db, email=body.email, purpose="reset_password", code=body.code
    )
    if not code_record:
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")

    account = await get_account_by_email(db, body.email)
    if not account:
        raise HTTPException(status_code=400, detail="Аккаунт не найден")

    await mark_code_used(db, code_record.id)
    await update_account(
        db,
        account_id=account.id,
        password_hash=hash_password(body.new_password),
    )

    return MessageResponse(message="Пароль успешно изменён")


# ─── POST /auth/refresh ──────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = await jwt_service.verify_refresh_token(token, settings.WEB_JWT_SECRET, redis)
    except jwt.InvalidTokenError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    account_id = uuid.UUID(payload["sub"])
    old_jti = payload["jti"]

    new_refresh, new_jti = await jwt_service.rotate_refresh_token(
        old_jti=old_jti,
        account_id=account_id,
        secret=settings.WEB_JWT_SECRET,
        expire_days=settings.WEB_JWT_REFRESH_EXPIRE_DAYS,
        redis=redis,
    )

    new_access = jwt_service.create_access_token(
        account_id=account_id,
        secret=settings.WEB_JWT_SECRET,
        expire_minutes=settings.WEB_JWT_ACCESS_EXPIRE_MINUTES,
    )

    secure = not settings.WEB_API_URL.startswith("http://localhost")
    _set_refresh_cookie(response, new_refresh, secure=secure)

    from core.dal.account_dal import get_account_by_id
    account = await get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=401, detail="Account not found")

    return TokenResponse(
        access_token=new_access,
        account_id=account.id,
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
    )


# ─── POST /auth/logout ───────────────────────────────────────────────────────

@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings_dep),
    redis=Depends(get_redis),
):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token:
        try:
            payload = await jwt_service.verify_refresh_token(token, settings.WEB_JWT_SECRET, redis)
            await jwt_service.revoke_refresh_token(payload["jti"], redis)
        except Exception:
            pass  # Token already invalid — just clear cookie

    _clear_refresh_cookie(response)
    return MessageResponse(message="Выход выполнен успешно")
