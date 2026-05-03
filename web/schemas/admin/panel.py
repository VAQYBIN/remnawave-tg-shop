from typing import Any, Dict, List, Optional

from pydantic import BaseModel


PanelObject = Dict[str, Any]


class PanelRawResponse(BaseModel):
    data: PanelObject


class PanelListResponse(BaseModel):
    items: List[PanelObject]
    total: int


class PanelUsersResponse(BaseModel):
    items: List[PanelObject]
    total: int
    page: int
    page_size: int


class PanelUserDetailResponse(BaseModel):
    data: PanelObject


class PanelNodeDetailResponse(BaseModel):
    data: PanelObject
    users_bandwidth: Optional[PanelObject] = None


class PanelNodeActionResponse(BaseModel):
    ok: bool
    node: Optional[PanelObject] = None

