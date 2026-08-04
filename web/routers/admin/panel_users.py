from fastapi import APIRouter, Depends, HTTPException, Query

from config.settings import Settings
from db.models import Account
from core.services.panel_client import PanelApiService
from web.dependencies import get_current_admin, get_settings_dep
from web.schemas.admin.panel import PanelUserDetailResponse, PanelUsersResponse

router = APIRouter(prefix="/panel/users")


def _panel(settings: Settings) -> PanelApiService:
    return PanelApiService(settings)


@router.get("", response_model=PanelUsersResponse)
async def list_panel_users(
    query: str | None = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    panel = _panel(settings)

    if query:
        found = None
        if query.isdigit():
            found = await panel.get_users_by_filter(telegram_id=int(query), log_response=False)
        if found is None:
            if "@" in query:
                found = await panel.get_users_by_filter(email=query, log_response=False)
            else:
                found = await panel.get_users_by_filter(username=query, log_response=False)
        if found is None:
            found = []
        total = len(found)
        start = page * page_size
        return PanelUsersResponse(
            items=found[start:start + page_size],
            total=total,
            page=page,
            page_size=page_size,
        )

    start = page * page_size
    data = await panel.get_panel_users_page(start=start, size=page_size)
    if data is None:
        raise HTTPException(status_code=502, detail="Panel API error")
    return PanelUsersResponse(
        items=data.get("users", []),
        total=int(data.get("total") or 0),
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=PanelUserDetailResponse)
async def get_panel_user(
    user_id: int,
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_user_by_id(user_id, log_response=False)
    if data is None:
        raise HTTPException(status_code=404, detail="Panel user not found")
    return PanelUserDetailResponse(data=data)
