from typing import Optional, List
from pydantic import BaseModel


class ReferralFriend(BaseModel):
    name: Optional[str] = None
    handle: Optional[str] = None
    registered_at: Optional[str] = None
    status: str  # "registered" | "activated"
    bonus_days: int = 0


class ReferralResponse(BaseModel):
    referral_code: str
    referral_link: str  # web registration link, works without Telegram
    telegram_link: Optional[str] = None  # Telegram deep-link, if a bot is configured
    invited_count: int
    purchased_count: int
    total_bonus_days: int = 0
    bonus_days_per_month: Optional[dict] = None
    friends: List[ReferralFriend] = []
