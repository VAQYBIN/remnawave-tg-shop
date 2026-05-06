import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_current_admin, get_redis, get_db
from web.schemas.admin.broadcast import (
    BroadcastRequest,
    BroadcastStartResponse,
    BroadcastStatusResponse,
)
from web.middleware.rate_limit import admin_broadcast_limit
from web.routers.admin.audit import add_admin_audit_log

router = APIRouter()

_STATUS_TTL = 3600  # 1 hour


@router.post("/broadcast", response_model=BroadcastStartResponse, dependencies=[Depends(admin_broadcast_limit)])
async def start_broadcast(
    req: BroadcastRequest,
    admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Broadcast text cannot be empty")

    broadcast_id = str(uuid.uuid4())

    initial_status = {"status": "pending", "total": 0, "sent": 0, "failed": 0}
    await redis.set(
        f"broadcast:status:{broadcast_id}",
        json.dumps(initial_status),
        ex=_STATUS_TTL,
    )

    payload = {
        "id": broadcast_id,
        "text": req.text,
        "filter": req.filter,
        "buttons": [b.model_dump() for b in req.buttons],
    }
    await redis.publish("broadcast:request", json.dumps(payload))

    await add_admin_audit_log(
        db,
        admin,
        "admin_broadcast",
        details={
            "broadcast_id": broadcast_id,
            "filter": req.filter,
            "text_preview": req.text[:100],
        },
    )
    await db.commit()

    return BroadcastStartResponse(broadcast_id=broadcast_id, status="queued")


@router.get("/broadcast/status/{broadcast_id}", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    broadcast_id: str,
    admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
):
    raw = await redis.get(f"broadcast:status:{broadcast_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Broadcast not found or expired")

    data = json.loads(raw)
    return BroadcastStatusResponse(broadcast_id=broadcast_id, **data)
