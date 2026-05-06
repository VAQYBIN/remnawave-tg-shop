from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config.settings import Settings
from db.models import Account
from core.services.panel_client import PanelApiService
from web.dependencies import get_current_admin, get_settings_dep
from web.schemas.admin.panel import PanelRawResponse

router = APIRouter(prefix="/panel")


def _panel(settings: Settings) -> PanelApiService:
    return PanelApiService(settings)


def _raise_panel_error() -> None:
    raise HTTPException(status_code=502, detail="Panel API error")


@router.get("/stats", response_model=PanelRawResponse)
async def get_panel_stats(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_system_stats()
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)


@router.get("/metadata", response_model=PanelRawResponse)
async def get_panel_metadata(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_system_metadata()
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)


@router.get("/bandwidth", response_model=PanelRawResponse)
async def get_panel_bandwidth(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    top_nodes_limit: int = Query(10, ge=1, le=100),
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    today = date.today()
    end = date_to or today
    start = date_from or (end - timedelta(days=6))
    data = await _panel(settings).get_nodes_bandwidth(start, end, top_nodes_limit)
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)


@router.get("/bandwidth/realtime", response_model=PanelRawResponse)
async def get_panel_realtime_bandwidth(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_nodes_realtime()
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)


@router.get("/nodes/stats", response_model=PanelRawResponse)
async def get_panel_nodes_stats(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_nodes_stats()
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)


@router.get("/hwid/stats", response_model=PanelRawResponse)
async def get_panel_hwid_stats(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    data = await _panel(settings).get_hwid_stats()
    if data is None:
        _raise_panel_error()
    return PanelRawResponse(data=data)

