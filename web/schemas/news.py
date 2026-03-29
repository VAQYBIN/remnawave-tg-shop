from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ChannelPostResponse(BaseModel):
    id: int
    telegram_message_id: int
    channel_id: int
    text: Optional[str] = None
    entities_json: Optional[str] = None
    media_type: Optional[str] = None
    media_file_id: Optional[str] = None
    media_url: Optional[str] = None
    reply_markup_json: Optional[str] = None
    posted_at: datetime

    model_config = {"from_attributes": True}


class NewsListResponse(BaseModel):
    posts: list[ChannelPostResponse]
    total: int
    page: int
    limit: int
