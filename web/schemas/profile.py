from typing import Optional
from pydantic import BaseModel


class ProfileResponse(BaseModel):
    account_id: str
    email: Optional[str]
    is_email_verified: bool
    email_notifications_enabled: bool = True
    language_code: str
    telegram_user_id: Optional[int]
    # Telegram user fields (if linked)
    telegram_username: Optional[str] = None
    telegram_first_name: Optional[str] = None
