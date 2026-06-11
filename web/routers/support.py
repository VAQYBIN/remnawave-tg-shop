"""
Support tickets (user-facing):
  GET    /api/support/tickets               — list the account's tickets
  POST   /api/support/tickets               — open a new ticket
  GET    /api/support/tickets/{id}          — ticket detail + messages (marks read)
  POST   /api/support/tickets/{id}/messages — append a message
  POST   /api/support/tickets/{id}/close    — close own ticket
  POST   /api/support/attachments           — upload an image, returns its id+url
  GET    /api/support/unread                — count of tickets with unread admin replies
  GET    /api/support/stream?token=         — SSE notifications (token in query)
"""
import asyncio
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from redis.asyncio import Redis
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal import support_ticket_dal as dal
from core.dal.site_settings_dal import get_site_settings
from core.services import support_core
from db.models import Account
from web.dependencies import get_current_account, get_db, get_redis, get_settings_dep
from web.schemas.support import (
    AttachmentResponse,
    CreateMessageRequest,
    CreateTicketRequest,
    SupportMessageResponse,
    SupportTicketDetailResponse,
    SupportTicketListItem,
    SupportTicketListResponse,
    UnreadCountResponse,
)
from web.support_uploads import save_support_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["support"])

_SSE_PING_INTERVAL = 3


async def _ensure_enabled(db: AsyncSession) -> None:
    site = await get_site_settings(db)
    if not site.support_enabled:
        raise HTTPException(status_code=403, detail="Поддержка отключена")


def _ticket_detail(ticket) -> SupportTicketDetailResponse:
    return SupportTicketDetailResponse(
        id=ticket.id,
        subject=ticket.subject,
        category=ticket.category,
        status=ticket.status,
        unread_by_user=ticket.unread_by_user,
        created_at=ticket.created_at,
        last_message_at=ticket.last_message_at,
        messages=[SupportMessageResponse.model_validate(m) for m in ticket.messages],
    )


# ─── List ────────────────────────────────────────────────────────────────────

@router.get("/tickets", response_model=SupportTicketListResponse)
async def list_my_tickets(
    page: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=100),
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_enabled(db)
    tickets, total = await dal.list_tickets_for_account(
        db, account.id, page=page, page_size=page_size
    )
    return SupportTicketListResponse(
        items=[SupportTicketListItem.model_validate(t) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Create ──────────────────────────────────────────────────────────────────

@router.post("/tickets", response_model=SupportTicketDetailResponse)
async def create_ticket(
    body: CreateTicketRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    settings: Settings = Depends(get_settings_dep),
):
    await _ensure_enabled(db)
    try:
        attachments = await support_core.resolve_attachments(
            db,
            account=account,
            attachment_ids=body.attachment_ids,
            max_attachments=settings.SUPPORT_MAX_ATTACHMENTS_PER_MESSAGE,
        )
        ticket = await support_core.create_ticket(
            db,
            account=account,
            subject=body.subject,
            category=body.category,
            body=body.body,
            attachments=attachments,
            max_open_tickets=settings.SUPPORT_MAX_OPEN_TICKETS_PER_USER,
            redis=redis,
        )
    except support_core.SupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    full = await dal.get_ticket(db, ticket.id, with_messages=True)
    return _ticket_detail(full)


# ─── Detail ──────────────────────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetailResponse)
async def get_ticket(
    ticket_id: int,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_enabled(db)
    ticket = await dal.get_ticket(db, ticket_id, with_messages=True)
    if ticket is None or ticket.account_id != account.id:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    if ticket.unread_by_user:
        await dal.mark_read_by_user(db, ticket.id)
        ticket.unread_by_user = False
    return _ticket_detail(ticket)


# ─── Append message ────────────────────────────────────────────────────────--

@router.post("/tickets/{ticket_id}/messages", response_model=SupportMessageResponse)
async def add_message(
    ticket_id: int,
    body: CreateMessageRequest,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    settings: Settings = Depends(get_settings_dep),
):
    await _ensure_enabled(db)
    ticket = await dal.get_ticket(db, ticket_id)
    if ticket is None or ticket.account_id != account.id:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    try:
        attachments = await support_core.resolve_attachments(
            db,
            account=account,
            attachment_ids=body.attachment_ids,
            max_attachments=settings.SUPPORT_MAX_ATTACHMENTS_PER_MESSAGE,
        )
        message = await support_core.post_user_message(
            db,
            account=account,
            ticket=ticket,
            body=body.body,
            attachments=attachments,
            redis=redis,
        )
    except support_core.SupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # Reload with attachments for the response.
    messages = await dal.get_messages(db, ticket.id)
    created = next((m for m in messages if m.id == message.id), message)
    return SupportMessageResponse.model_validate(created)


# ─── Close ───────────────────────────────────────────────────────────────────

@router.post("/tickets/{ticket_id}/close", response_model=SupportTicketDetailResponse)
async def close_ticket(
    ticket_id: int,
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    await _ensure_enabled(db)
    ticket = await dal.get_ticket(db, ticket_id)
    if ticket is None or ticket.account_id != account.id:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    await support_core.close_ticket_by_user(db, ticket=ticket, redis=redis)
    full = await dal.get_ticket(db, ticket.id, with_messages=True)
    return _ticket_detail(full)


# ─── Attachment upload ─────────────────────────────────────────────────────--

@router.post("/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    await _ensure_enabled(db)
    file_path, url, content_type, size = await save_support_image(
        file, settings.SUPPORT_MAX_ATTACHMENT_SIZE_MB
    )
    attachment = await dal.create_attachment(
        db,
        account_id=account.id,
        file_path=file_path,
        url=url,
        content_type=content_type,
        file_size=size,
    )
    return AttachmentResponse.model_validate(attachment)


# ─── Unread count ──────────────────────────────────────────────────────────--

@router.get("/unread", response_model=UnreadCountResponse)
async def unread_count(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
):
    count = await dal.count_unread_for_user(db, account.id)
    return UnreadCountResponse(count=count)


# ─── SSE stream ────────────────────────────────────────────────────────────--

@router.post("/stream-ticket")
async def create_stream_ticket(
    account: Account = Depends(get_current_account),
    redis: Redis = Depends(get_redis),
):
    """Mint a short-lived, single-use ticket for authenticating the SSE stream."""
    token = await support_core.mint_stream_ticket(redis, scope="user", account_id=account.id)
    return {"ticket": token}


@router.get("/stream")
async def support_stream(
    request: Request,
    ticket: str = Query(...),
    redis: Redis = Depends(get_redis),
):
    account_id_str = await support_core.consume_stream_ticket(redis, scope="user", token=ticket)
    if not account_id_str:
        raise HTTPException(status_code=401, detail="Invalid or expired stream ticket")
    try:
        account_id = uuid.UUID(account_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid stream ticket")

    channel = support_core.channel_for_user(account_id)

    async def event_generator() -> AsyncGenerator[dict, None]:
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        queue: asyncio.Queue = asyncio.Queue()

        async def _reader() -> None:
            # Poll with a timeout instead of the blocking listen() generator:
            # an idle channel returns None rather than raising a socket timeout
            # that would silently kill this reader.
            try:
                while True:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if msg is not None:
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
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception:
                pass

    return EventSourceResponse(
        event_generator(),
        ping=_SSE_PING_INTERVAL,
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
