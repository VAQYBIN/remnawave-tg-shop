import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from config.settings import Settings, get_settings
from db.models import Account
from web.dependencies import get_current_account, get_db
from web.schemas.profile import ProfileResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PatchLanguageRequest(BaseModel):
    language_code: str

    @field_validator("language_code")
    @classmethod
    def validate_lang(cls, v: str) -> str:
        allowed = {"ru", "en"}
        v = v.strip().lower()
        if v not in allowed:
            raise ValueError(f"Supported languages: {allowed}")
        return v


class SendEmailChangeCodeRequest(BaseModel):
    new_email: EmailStr

    @field_validator("new_email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class VerifyEmailChangeRequest(BaseModel):
    new_email: EmailStr
    code: str

    @field_validator("new_email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class LinkTelegramRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=ProfileResponse)
async def get_profile(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    user = account.telegram_user

    return ProfileResponse(
        account_id=str(account.id),
        email=account.email,
        is_email_verified=account.is_email_verified,
        language_code=account.language_code,
        telegram_user_id=account.telegram_user_id,
        telegram_username=user.username if user else None,
        telegram_first_name=user.first_name if user else None,
    )


@router.patch("/language")
async def patch_language(
    body: PatchLanguageRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from core.dal.account_dal import update_account
    await update_account(db, account.id, language_code=body.language_code)
    return {"language_code": body.language_code}


@router.post("/email/send-code")
async def send_email_change_code(
    body: SendEmailChangeCodeRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    from core.dal.account_dal import get_account_by_email
    from core.dal.email_verification_code_dal import create_verification_code
    from web.auth.email_service import send_verification_code

    # Ensure new email is not taken by another account
    existing = await get_account_by_email(db, body.new_email)
    if existing and existing.id != account.id:
        raise HTTPException(status_code=409, detail="Email already in use")

    code_record = await create_verification_code(
        db, email=body.new_email, purpose="change_email", account_id=account.id
    )

    if settings.RESEND_API_KEY:
        try:
            await send_verification_code(
                email=body.new_email,
                code=code_record.code,
                purpose="change_email",
                api_key=settings.RESEND_API_KEY,
                from_email=settings.RESEND_FROM_EMAIL,
            )
        except Exception as exc:
            logger.error("Failed to send email change code: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to send verification email")

    return {"message": "Verification code sent"}


@router.post("/email/verify")
async def verify_email_change(
    body: VerifyEmailChangeRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from core.dal.email_verification_code_dal import get_active_code, mark_code_used
    from core.dal.account_dal import get_account_by_email, update_account

    code_record = await get_active_code(db, email=body.new_email, purpose="change_email", code=body.code)
    if not code_record or code_record.account_id != account.id:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    # Ensure email still not taken
    existing = await get_account_by_email(db, body.new_email)
    if existing and existing.id != account.id:
        raise HTTPException(status_code=409, detail="Email already in use")

    await mark_code_used(db, code_record.id)
    await update_account(db, account.id, email=body.new_email, is_email_verified=True)

    return {"message": "Email updated", "email": body.new_email}


@router.post("/link-telegram")
async def link_telegram(
    body: LinkTelegramRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Link a Telegram account to the current web account via OIDC PKCE flow."""
    from web.auth.telegram_auth import exchange_code_for_tokens, verify_id_token, extract_telegram_user_id
    from core.dal.account_dal import get_account_by_telegram_id, update_account
    from core.dal.user_dal import get_user_by_id, create_user, update_user
    from core.services.account_linking import (
        merge_site_subscription_into_telegram,
        sync_telegram_panel_identity,
    )

    if not settings.TELEGRAM_OIDC_CLIENT_SECRET or not settings.telegram_client_id:
        raise HTTPException(status_code=503, detail="Telegram OIDC not configured")

    try:
        tokens = await exchange_code_for_tokens(
            code=body.code,
            code_verifier=body.code_verifier,
            redirect_uri=body.redirect_uri,
            bot_id=settings.telegram_client_id,
            client_secret=settings.TELEGRAM_OIDC_CLIENT_SECRET,
        )
    except Exception as exc:
        logger.warning("Telegram token exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail="Telegram authentication failed")

    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="No id_token in Telegram response")

    try:
        claims = await verify_id_token(id_token, settings.telegram_client_id)
    except Exception as exc:
        logger.warning("Telegram id_token verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid Telegram token")

    telegram_user_id = extract_telegram_user_id(claims)
    if not telegram_user_id:
        raise HTTPException(status_code=400, detail="Could not extract Telegram user ID")

    # Check if another account already has this Telegram linked
    existing = await get_account_by_telegram_id(db, telegram_user_id)
    if existing and existing.id != account.id:
        is_empty_telegram_only_account = (
            existing.email is None
            and existing.password_hash is None
            and existing.site_user_id is None
        )
        if is_empty_telegram_only_account:
            await update_account(db, existing.id, telegram_user_id=None)
        else:
            raise HTTPException(
                status_code=409,
                detail="Этот Telegram уже привязан к другому web-аккаунту. Сначала отвяжите Telegram в старом аккаунте.",
            )

    tg_user = await get_user_by_id(db, telegram_user_id)
    language_code = claims.get("language_code") or account.language_code or "ru"
    user_payload = {
        "user_id": telegram_user_id,
        "username": claims.get("username"),
        "first_name": claims.get("first_name"),
        "last_name": claims.get("last_name"),
        "language_code": language_code,
    }
    if not tg_user:
        tg_user, _ = await create_user(db, user_payload)
    else:
        tg_user = await update_user(
            db,
            telegram_user_id,
            {
                "username": user_payload["username"],
                "first_name": user_payload["first_name"],
                "last_name": user_payload["last_name"],
                "language_code": language_code,
            },
        )

    merge_result: dict = {}
    if account.site_user_id:
        try:
            merge_result = await merge_site_subscription_into_telegram(
                db,
                settings,
                account=account,
                telegram_user=tg_user,
            )
        except Exception:
            logger.error("Subscription merge failed for account %s", account.id, exc_info=True)
            merge_result = {"merged": False, "reason": "internal_error"}

    try:
        panel_sync_result = await sync_telegram_panel_identity(
            db,
            settings,
            account=account,
            telegram_user=tg_user,
        )
    except Exception:
        logger.error("Panel identity sync failed for account %s", account.id, exc_info=True)
        panel_sync_result = {"synced": False, "reason": "internal_error"}

    try:
        from core.services.trial_core import sync_trial_identity_on_telegram_link

        await sync_trial_identity_on_telegram_link(
            db,
            account=account,
            telegram_user_id=telegram_user_id,
        )
    except Exception:
        logger.error("Trial identity sync failed for account %s", account.id, exc_info=True)

    await update_account(db, account.id, telegram_user_id=telegram_user_id)

    return {
        "message": "Telegram account linked",
        "telegram_user_id": telegram_user_id,
        "merge": merge_result,
        "panel_sync": panel_sync_result,
    }


@router.post("/unlink-telegram")
async def unlink_telegram(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    from core.services.account_linking import unlink_telegram_from_account

    unlinked = await unlink_telegram_from_account(
        db,
        settings,
        account=account,
    )
    if not unlinked:
        raise HTTPException(status_code=400, detail="Telegram account is not linked")
    return {"message": "Telegram account unlinked"}
