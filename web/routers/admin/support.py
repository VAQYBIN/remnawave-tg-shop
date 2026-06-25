"""
Support tickets (admin panel):
  GET    /api/admin/support/tickets               — list/filter all tickets
  GET    /api/admin/support/tickets/{id}          — detail + messages (marks read)
  POST   /api/admin/support/tickets/{id}/messages — reply to the user
  PATCH  /api/admin/support/tickets/{id}/status   — change ticket status
  POST   /api/admin/support/attachments           — upload an image, returns id+url
  GET    /api/admin/support/unread-count          — tickets awaiting admin attention
  GET    /api/admin/support/stream?token=         — SSE notifications (token in query)
"""
import asyncio
import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from redis.asyncio import Redis
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal import support_ticket_dal as dal
from core.services import support_core
from db.models import (
    SUPPORT_STATUS_CLOSED,
    SUPPORT_STATUS_IN_PROGRESS,
    Account,
    SupportTicket,
)
from web.dependencies import (
    get_current_admin,
    get_db,
    get_redis,
    get_settings_dep,
)
from web.schemas.admin.support import (
    AdminReplyRequest,
    AdminSupportTicketDetailResponse,
    AdminSupportTicketListItem,
    AdminSupportTicketListResponse,
    AdminUnreadCountResponse,
)
from web.schemas.support import AttachmentResponse, SupportMessageResponse
from web.support_uploads import save_support_image

logger = logging.getLogger(__name__)

router = APIRouter()

_SSE_PING_INTERVAL = 3


def _account_fields(ticket: SupportTicket) -> dict:
    account = ticket.account
    user = getattr(account, "telegram_user", None) if account else None
    return {
        "account_id": str(ticket.account_id),
        "account_label": support_core._account_label(account),
        "account_email": account.email if account else None,
        "telegram_user_id": account.telegram_user_id if account else None,
        "telegram_username": user.username if user else None,
    }


def _list_item(ticket: SupportTicket) -> AdminSupportTicketListItem:
    return AdminSupportTicketListItem(
        id=ticket.id,
        subject=ticket.subject,
        category=ticket.category,
        status=ticket.status,
        unread_by_admin=ticket.unread_by_admin,
        last_message_at=ticket.last_message_at,
        created_at=ticket.created_at,
        **_account_fields(ticket),
    )


def _detail(ticket: SupportTicket) -> AdminSupportTicketDetailResponse:
    return AdminSupportTicketDetailResponse(
        id=ticket.id,
        subject=ticket.subject,
        category=ticket.category,
        status=ticket.status,
        unread_by_admin=ticket.unread_by_admin,
        created_at=ticket.created_at,
        last_message_at=ticket.last_message_at,
        messages=[SupportMessageResponse.model_validate(m) for m in ticket.messages],
        **_account_fields(ticket),
    )


# ─── List ────────────────────────────────────────────────────────────────────

@router.get("/support/tickets", response_model=AdminSupportTicketListResponse)
async def list_tickets(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    tickets, total = await dal.list_tickets_admin(
        db, page=page, page_size=page_size, status=status, category=category, search=search
    )
    return AdminSupportTicketListResponse(
        items=[_list_item(t) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Detail ──────────────────────────────────────────────────────────────────

@router.get("/support/tickets/{ticket_id}", response_model=AdminSupportTicketDetailResponse)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    ticket = await dal.get_ticket(db, ticket_id, with_messages=True)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    if ticket.unread_by_admin:
        await dal.mark_read_by_admin(db, ticket.id)
        ticket.unread_by_admin = False
    return _detail(ticket)


# ─── Reply ───────────────────────────────────────────────────────────────────

@router.post("/support/tickets/{ticket_id}/messages", response_model=SupportMessageResponse)
async def reply(
    ticket_id: int,
    body: AdminReplyRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    settings: Settings = Depends(get_settings_dep),
):
    ticket = await dal.get_ticket(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    try:
        attachments = await support_core.resolve_attachments(
            db,
            account=admin,
            attachment_ids=body.attachment_ids,
            max_attachments=settings.SUPPORT_MAX_ATTACHMENTS_PER_MESSAGE,
        )
        message = await support_core.post_admin_reply(
            db,
            admin=admin,
            ticket=ticket,
            body=body.body,
            attachments=attachments,
            redis=redis,
        )
    except support_core.SupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    messages = await dal.get_messages(db, ticket.id)
    created = next((m for m in messages if m.id == message.id), message)
    return SupportMessageResponse.model_validate(created)


# ─── Status actions ──────────────────────────────────────────────────────────

async def _set_status(
    ticket_id: int,
    status: str,
    db: AsyncSession,
    redis: Redis,
    allowed_from: set,
):
    ticket = await dal.get_ticket(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    if ticket.status not in allowed_from:
        raise HTTPException(status_code=409, detail="Недопустимое действие для текущего статуса")
    try:
        await support_core.set_status_by_admin(db, ticket=ticket, status=status, redis=redis)
    except support_core.SupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    full = await dal.get_ticket(db, ticket.id, with_messages=True)
    return _detail(full)


@router.post("/support/tickets/{ticket_id}/take", response_model=AdminSupportTicketDetailResponse)
async def take_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
):
    """Take the ticket into work (new → in_progress). The user is notified."""
    return await _set_status(ticket_id, SUPPORT_STATUS_IN_PROGRESS, db, redis, allowed_from={"new"})


@router.post("/support/tickets/{ticket_id}/close", response_model=AdminSupportTicketDetailResponse)
async def close_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
):
    """Close the ticket — only allowed once it has been taken into work. The user is notified."""
    return await _set_status(ticket_id, SUPPORT_STATUS_CLOSED, db, redis, allowed_from={"in_progress"})


# ─── Attachment upload ─────────────────────────────────────────────────────--

@router.post("/support/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
    settings: Settings = Depends(get_settings_dep),
):
    file_path, url, content_type, size = await save_support_image(
        file, settings.SUPPORT_MAX_ATTACHMENT_SIZE_MB
    )
    attachment = await dal.create_attachment(
        db,
        account_id=admin.id,
        file_path=file_path,
        url=url,
        content_type=content_type,
        file_size=size,
    )
    return AttachmentResponse.model_validate(attachment)


# ─── Unread count ──────────────────────────────────────────────────────────--

@router.get("/support/unread-count", response_model=AdminUnreadCountResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    count = await dal.count_unread_for_admin(db)
    return AdminUnreadCountResponse(count=count)


# ─── SSE stream ────────────────────────────────────────────────────────────--

@router.post("/support/stream-ticket")
async def create_stream_ticket(
    admin: Account = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
):
    """Mint a short-lived, single-use ticket for authenticating the admin SSE stream."""
    token = await support_core.mint_stream_ticket(redis, scope="admin", account_id=admin.id)
    return {"ticket": token}


@router.get("/support/stream")
async def support_stream(
    request: Request,
    ticket: str = Query(...),
    redis: Redis = Depends(get_redis),
):
    # The "admin" scope is only ever minted behind get_current_admin, so a valid
    # admin-scoped ticket already proves admin authorization.
    account_id_str = await support_core.consume_stream_ticket(redis, scope="admin", token=ticket)
    if not account_id_str:
        raise HTTPException(status_code=403, detail="Invalid or expired stream ticket")

    async def event_generator() -> AsyncGenerator[dict, None]:
        pubsub = redis.pubsub()
        await pubsub.subscribe(support_core.CHANNEL_ADMIN)
        queue: asyncio.Queue = asyncio.Queue()

        async def _reader() -> None:
            try:
                async for msg in pubsub.listen():
                    await queue.put(msg)
            except (asyncio.CancelledError, Exception):
                pass

        reader_task = asyncio.create_task(_reader())
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue
                if message.get("type") != "message":
                    continue
                yield {"data": message["data"]}
        except (asyncio.CancelledError, GeneratorExit):
            raise
        finally:
            reader_task.cancel()
            try:
                await pubsub.unsubscribe(support_core.CHANNEL_ADMIN)
                await pubsub.aclose()
            except Exception:
                pass

    return EventSourceResponse(
        event_generator(),
        ping=_SSE_PING_INTERVAL,
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
