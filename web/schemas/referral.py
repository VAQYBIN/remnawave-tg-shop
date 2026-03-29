from typing import Optional
from pydantic import BaseModel


class ReferralResponse(BaseModel):
    referral_code: str
    referral_link: str
    invited_count: int
    purchased_count: int
    bonus_days_per_month: Optional[dict] = None
