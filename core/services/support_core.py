"""Provider-agnostic business logic for the support ticket system.

Shared by the web user API and the web admin API. File storage and HTTP
concerns live in the web layer; this module owns validation, the DB writes
(via support_ticket_dal), and Redis pub/sub fan-out for real-time
notifications.
"""
import json
import logging
import secrets
import uuid
from typing import List, Optional, Sequence

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from core.dal import support_ticket_dal as dal
from db.models import (
    SUPPORT_CATEGORY_CONNECTION,
    SUPPORT_CATEGORY_OTHER,
    SUPPORT_CATEGORY_PAYMENT,
    SUPPORT_CATEGORY_SUBSCRIPTION,
    SUPPORT_SENDER_ADMIN,
    SUPPORT_SENDER_USER,
    SUPPORT_STATUS_CLOSED,
    SUPPORT_STATUS_IN_PROGRESS,
    SUPPORT_STATUS_NEW,
    Account,
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketMessage,
)

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    SUPPORT_CATEGORY_PAYMENT,
    SUPPORT_CATEGORY_CONNECTION,
    SUPPORT_CATEGORY_SUBSCRIPTION,
    SUPPORT_CATEGORY_OTHER,
}

VALID_STATUSES = {
    SUPPORT_STATUS_NEW,
    SUPPORT_STATUS_IN_PROGRESS,
    SUPPORT_STATUS_CLOSED,
}

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}

# Redis pub/sub channels
CHANNEL_ADMIN = "support:admin"

# Short-lived, single-use SSE auth tickets. EventSource cannot send an
# Authorization header, so instead of putting the long-lived JWT in the URL
# (which leaks into proxy/server logs and browser history) the client first
# POSTs — with its normal Bearer token — to mint an opaque ticket, then passes
# that ticket as the query parameter. The ticket is account-bound, scoped, and
# consumed (deleted) on first use.
STREAM_TICKET_TTL = 30  # seconds


def channel_for_user(account_id: uuid.UUID) -> str:
    return f"support:user:{account_id}"


def _stream_ticket_key(scope: str, token: str) -> str:
    return f"support:stream-ticket:{scope}:{token}"


async def mint_stream_ticket(redis: Redis, *, scope: str, account_id: uuid.UUID) -> str:
    token = secrets.token_urlsafe(32)
    await redis.set(_stream_ticket_key(scope, token), str(account_id), ex=STREAM_TICKET_TTL)
    return token


async def consume_stream_ticket(redis: Redis, *, scope: str, token: str) -> Optional[str]:
    """Validate and single-use-consume a stream ticket. Returns the account_id string or None."""
    if not token:
        return None
    key = _stream_ticket_key(scope, token)
    account_id = await redis.get(key)
    if account_id is None:
        return None
    await redis.delete(key)  # single-use
    return account_id


class SupportError(Exception):
    """Raised on a validation/business-rule failure. ``code`` maps to an HTTP 400/403."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _account_label(account: Optional[Account]) -> str:
    if account is None:
        return "—"
    user = getattr(account, "telegram_user", None)
    if user and user.username:
        return f"@{user.username}"
    if account.email:
        return account.email
    if account.telegram_user_id:
        return f"tg:{account.telegram_user_id}"
    return str(account.id)


def _preview(body: str, limit: int = 120) -> str:
    body = (body or "").strip().replace("\n", " ")
    return body if len(body) <= limit else body[: limit - 1] + "…"


async def _publish(redis: Optional[Redis], channel: str, payload: dict) -> None:
    if redis is None:
        return
    try:
        await redis.publish(channel, json.dumps(payload, ensure_ascii=False))
    except Exception as exc:  # never let a notification failure break the request
        logger.warning("support_core: failed to publish to %s: %s", channel, exc)


# ─── Creation flows ──────────────────────────────────────────────────────────

async def create_ticket(
    session: AsyncSession,
    *,
    account: Account,
    subject: str,
    category: str,
    body: str,
    attachments: Sequence[SupportTicketAttachment] = (),
    max_open_tickets: int,
    redis: Optional[Redis] = None,
) -> SupportTicket:
    subject = (subject or "").strip()
    body = (body or "").strip()
    if not subject:
        raise SupportError("Тема обращения не может быть пустой")
    if len(subject) > 200:
        raise SupportError("Тема обращения слишком длинная")
    if not body:
        raise SupportError("Текст обращения не может быть пустым")
    if category not in VALID_CATEGORIES:
        raise SupportError("Недопустимая категория обращения")

    open_count = await dal.count_open_tickets_for_account(session, account.id)
    if open_count >= max_open_tickets:
        raise SupportError(
            f"Достигнут лимит открытых обращений ({max_open_tickets}). "
            "Дождитесь ответа или закройте существующие обращения.",
            status_code=409,
        )

    ticket = await dal.create_ticket(
        session, account_id=account.id, subject=subject, category=category
    )
    message = await dal.create_message(
        session,
        ticket=ticket,
        sender_type=SUPPORT_SENDER_USER,
        body=body,
        sender_account_id=account.id,
    )
    await _attach(session, account, message, attachments)

    await _publish(
        redis,
        CHANNEL_ADMIN,
        {
            "event": "new_ticket",
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "category": ticket.category,
            "status": ticket.status,
            "account_label": _account_label(account),
            "preview": _preview(body),
        },
    )
    return ticket


async def post_user_message(
    session: AsyncSession,
    *,
    account: Account,
    ticket: SupportTicket,
    body: str,
    attachments: Sequence[SupportTicketAttachment] = (),
    redis: Optional[Redis] = None,
) -> SupportTicketMessage:
    body = (body or "").strip()
    if not body and not attachments:
        raise SupportError("Сообщение не может быть пустым")
    if ticket.status == SUPPORT_STATUS_CLOSED:
        raise SupportError("Обращение закрыто. Создайте новое обращение.", status_code=409)

    message = await dal.create_message(
        session,
        ticket=ticket,
        sender_type=SUPPORT_SENDER_USER,
        body=body,
        sender_account_id=account.id,
    )
    await _attach(session, account, message, attachments)

    await _publish(
        redis,
        CHANNEL_ADMIN,
        {
            "event": "new_message",
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "category": ticket.category,
            "status": ticket.status,
            "account_label": _account_label(account),
            "preview": _preview(body),
        },
    )
    return message


async def post_admin_reply(
    session: AsyncSession,
    *,
    admin: Account,
    ticket: SupportTicket,
    body: str,
    attachments: Sequence[SupportTicketAttachment] = (),
    redis: Optional[Redis] = None,
) -> SupportTicketMessage:
    body = (body or "").strip()
    if not body and not attachments:
        raise SupportError("Сообщение не может быть пустым")
    if ticket.status == SUPPORT_STATUS_CLOSED:
        raise SupportError("Обращение закрыто", status_code=409)

    message = await dal.create_message(
        session,
        ticket=ticket,
        sender_type=SUPPORT_SENDER_ADMIN,
        body=body,
        sender_account_id=admin.id,
    )
    await _attach(session, admin, message, attachments)

    # Auto-advance a brand-new ticket to "in progress" when the admin replies.
    if ticket.status == SUPPORT_STATUS_NEW:
        await dal.set_status(session, ticket, SUPPORT_STATUS_IN_PROGRESS)

    await _publish(
        redis,
        channel_for_user(ticket.account_id),
        {
            "event": "reply",
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "status": ticket.status,
            "preview": _preview(body),
        },
    )
    return message


async def set_status_by_admin(
    session: AsyncSession,
    *,
    ticket: SupportTicket,
    status: str,
    redis: Optional[Redis] = None,
) -> SupportTicket:
    if status not in VALID_STATUSES:
        raise SupportError("Недопустимый статус обращения")
    await dal.set_status(session, ticket, status)
    await _publish(
        redis,
        channel_for_user(ticket.account_id),
        {
            "event": "status",
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "status": ticket.status,
        },
    )
    return ticket


async def close_ticket_by_user(
    session: AsyncSession,
    *,
    ticket: SupportTicket,
    redis: Optional[Redis] = None,
) -> SupportTicket:
    if ticket.status == SUPPORT_STATUS_CLOSED:
        return ticket
    await dal.set_status(session, ticket, SUPPORT_STATUS_CLOSED)
    await _publish(
        redis,
        CHANNEL_ADMIN,
        {
            "event": "status",
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "status": ticket.status,
            "account_label": _account_label(ticket.account),
        },
    )
    return ticket


# ─── Attachments ───────────────────────────────────────────────────────────--

async def _attach(
    session: AsyncSession,
    account: Account,
    message: SupportTicketMessage,
    attachments: Sequence[SupportTicketAttachment],
) -> None:
    if attachments:
        await dal.link_attachments_to_message(session, attachments, message.id)


async def resolve_attachments(
    session: AsyncSession,
    *,
    account: Account,
    attachment_ids: Sequence[int],
    max_attachments: int,
) -> List[SupportTicketAttachment]:
    """Validate that the given attachment ids exist, are owned by the account and unlinked."""
    if not attachment_ids:
        return []
    if len(attachment_ids) > max_attachments:
        raise SupportError(f"Не более {max_attachments} изображений на сообщение")
    found = await dal.get_unlinked_attachments(session, attachment_ids, account.id)
    if len(found) != len(set(attachment_ids)):
        raise SupportError("Некоторые вложения не найдены или уже использованы")
    return found
