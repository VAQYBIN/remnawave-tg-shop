from typing import List, Optional

from pydantic import BaseModel, Field

from web.schemas.types import UTCDatetime


class AttachmentResponse(BaseModel):
    id: int
    url: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None

    model_config = {"from_attributes": True}


class SupportMessageResponse(BaseModel):
    id: int
    sender_type: str
    body: str
    created_at: UTCDatetime
    attachments: List[AttachmentResponse] = []

    model_config = {"from_attributes": True}


class SupportTicketListItem(BaseModel):
    id: int
    subject: str
    category: str
    status: str
    unread_by_user: bool
    last_message_at: UTCDatetime
    created_at: UTCDatetime

    model_config = {"from_attributes": True}


class SupportTicketListResponse(BaseModel):
    items: List[SupportTicketListItem]
    total: int
    page: int
    page_size: int


class SupportTicketDetailResponse(BaseModel):
    id: int
    subject: str
    category: str
    status: str
    unread_by_user: bool
    created_at: UTCDatetime
    last_message_at: UTCDatetime
    messages: List[SupportMessageResponse] = []

    model_config = {"from_attributes": True}


class CreateTicketRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    category: str
    body: str = Field(min_length=1, max_length=4000)
    attachment_ids: List[int] = []


class CreateMessageRequest(BaseModel):
    body: str = Field(default="", max_length=4000)
    attachment_ids: List[int] = []


class UnreadCountResponse(BaseModel):
    count: int
