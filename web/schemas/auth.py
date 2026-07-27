import uuid
from typing import Optional, Any, Dict
from pydantic import BaseModel, EmailStr, field_validator


# ─── Requests ──────────────────────────────────────────────────────────────

class TelegramCallbackRequest(BaseModel):
    """PKCE authorization code callback from Telegram OpenID Connect."""
    code: str
    code_verifier: str
    redirect_uri: str


class TelegramConfigResponse(BaseModel):
    client_id: int


class MiniAppAuthRequest(BaseModel):
    """Raw ``window.Telegram.WebApp.initData`` from a Telegram Mini App."""
    init_data: str


class RegisterSendCodeRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class RegisterVerifyRequest(BaseModel):
    email: EmailStr
    code: str
    password: str
    ref_code: Optional[str] = None  # referral code from a /register?ref=... link

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class EmailSendCodeRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class EmailVerifyRequest(BaseModel):
    email: EmailStr
    code: str
    ref_code: Optional[str] = None  # web referral from a /register?ref=... link

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class SendResetCodeRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class CheckCodeRequest(BaseModel):
    email: EmailStr
    code: str

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("email", mode="before")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ─── Responses ─────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    account_id: uuid.UUID
    email: Optional[str] = None
    is_email_verified: bool = False
    language_code: str = "ru"


class MessageResponse(BaseModel):
    message: str


class AccountResponse(BaseModel):
    id: uuid.UUID
    email: Optional[str]
    is_email_verified: bool
    language_code: str
    telegram_user_id: Optional[int] = None
