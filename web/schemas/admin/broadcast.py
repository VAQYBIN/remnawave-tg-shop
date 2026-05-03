from typing import Literal, Optional
from pydantic import BaseModel


class BroadcastRequest(BaseModel):
    text: str
    filter: Literal["all", "active", "inactive"] = "all"


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
