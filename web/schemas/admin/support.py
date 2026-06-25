from typing import List, Optional

from pydantic import BaseModel, Field

from web.schemas.support import SupportMessageResponse
from web.schemas.types import UTCDatetime


class AdminSupportTicketListItem(BaseModel):
    id: int
    subject: str
    category: str
    status: str
    unread_by_admin: bool
    account_id: str
    account_label: str
    account_email: Optional[str] = None
    telegram_user_id: Optional[int] = None
    telegram_username: Optional[str] = None
    last_message_at: UTCDatetime
    created_at: UTCDatetime


class AdminSupportTicketListResponse(BaseModel):
    items: List[AdminSupportTicketListItem]
    total: int
    page: int
    page_size: int


class AdminSupportTicketDetailResponse(BaseModel):
    id: int
    subject: str
    category: str
    status: str
    unread_by_admin: bool
    account_id: str
    account_label: str
    account_email: Optional[str] = None
    telegram_user_id: Optional[int] = None
    telegram_username: Optional[str] = None
    created_at: UTCDatetime
    last_message_at: UTCDatetime
    messages: List[SupportMessageResponse] = []


class AdminReplyRequest(BaseModel):
    body: str = Field(default="", max_length=4000)
    attachment_ids: List[int] = []


class AdminStatusUpdateRequest(BaseModel):
    status: str


class AdminUnreadCountResponse(BaseModel):
    count: int
