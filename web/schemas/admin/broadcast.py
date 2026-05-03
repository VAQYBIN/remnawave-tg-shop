from typing import Literal, Optional, List
from pydantic import BaseModel


class ButtonItem(BaseModel):
    text: str
    url: str
    color: Literal["", "danger", "success", "primary"] = ""
    row: int = 0  # buttons with the same row index are placed in one keyboard row


class BroadcastRequest(BaseModel):
    text: str
    filter: Literal["all", "active", "inactive"] = "all"
    buttons: List[ButtonItem] = []


class BroadcastStartResponse(BaseModel):
    broadcast_id: str
    status: str = "queued"


class BroadcastStatusResponse(BaseModel):
    broadcast_id: str
    status: str  # pending | running | completed | failed
    total: int = 0
    sent: int = 0
    failed: int = 0
    error: Optional[str] = None
