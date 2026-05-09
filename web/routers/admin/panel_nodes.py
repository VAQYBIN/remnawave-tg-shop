from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from db.models import Account
from core.services.panel_client import PanelApiService
from web.dependencies import get_current_admin, get_db, get_settings_dep
from web.middleware.rate_limit import admin_action_limit
from web.routers.admin.audit import add_admin_audit_log
from web.schemas.admin.panel import (
    PanelListResponse,
    PanelNodeActionResponse,
    PanelNodeDetailResponse,
)

router = APIRouter(prefix="/panel/nodes")


def _panel(settings: Settings) -> PanelApiService:
    return PanelApiService(settings)


def _raise_panel_error() -> None:
    raise HTTPException(status_code=502, detail="Panel API error")


@router.get("", response_model=PanelListResponse)
async def list_panel_nodes(
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    nodes = await _panel(settings).get_all_nodes()
    if nodes is None:
        _raise_panel_error()
    return PanelListResponse(items=nodes, total=len(nodes))


@router.get("/{uuid}", response_model=PanelNodeDetailResponse)
async def get_panel_node(
    uuid: str,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    top_users_limit: int = Query(10, ge=1, le=100),
    _admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    panel = _panel(settings)
    node = await panel.get_node_by_uuid(uuid)
    if node is None:
        raise HTTPException(status_code=404, detail="Panel node not found")

    today = date.today()
    end = date_to or today
    start = date_from or (end - timedelta(days=6))
    users_bandwidth = await panel.get_node_users_bandwidth(
        uuid, start, end, top_users_limit
    )
    return PanelNodeDetailResponse(data=node, users_bandwidth=users_bandwidth)


@router.post("/{uuid}/enable", response_model=PanelNodeActionResponse, dependencies=[Depends(admin_action_limit)])
async def enable_panel_node(
    uuid: str,
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    node = await _panel(settings).enable_node(uuid)
    if node is None:
        _raise_panel_error()
    await add_admin_audit_log(db, admin, "admin_node_enable", details={"node_uuid": uuid})
    await db.commit()
    return PanelNodeActionResponse(ok=True, node=node)


@router.post("/{uuid}/disable", response_model=PanelNodeActionResponse, dependencies=[Depends(admin_action_limit)])
async def disable_panel_node(
    uuid: str,
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    node = await _panel(settings).disable_node(uuid)
    if node is None:
        _raise_panel_error()
    await add_admin_audit_log(db, admin, "admin_node_disable", details={"node_uuid": uuid})
    await db.commit()
    return PanelNodeActionResponse(ok=True, node=node)


@router.post("/{uuid}/restart", response_model=PanelNodeActionResponse, dependencies=[Depends(admin_action_limit)])
async def restart_panel_node(
    uuid: str,
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    node = await _panel(settings).restart_node(uuid)
    if node is None:
        _raise_panel_error()
    await add_admin_audit_log(db, admin, "admin_node_restart", details={"node_uuid": uuid})
    await db.commit()
    return PanelNodeActionResponse(ok=True, node=node)


@router.post("/restart-all", response_model=PanelNodeActionResponse, dependencies=[Depends(admin_action_limit)])
async def restart_all_panel_nodes(
    admin: Account = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    ok = await _panel(settings).restart_all_nodes()
    if not ok:
        _raise_panel_error()
    await add_admin_audit_log(db, admin, "admin_node_restart_all")
    await db.commit()
    return PanelNodeActionResponse(ok=True)
