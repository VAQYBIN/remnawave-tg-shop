"""Data-access layer for the support ticket system."""
import uuid
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import (
    SUPPORT_STATUS_CLOSED,
    SUPPORT_STATUS_NEW,
    SUPPORT_SENDER_ADMIN,
    SUPPORT_SENDER_USER,
    Account,
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketMessage,
)


# ─── Tickets ─────────────────────────────────────────────────────────────────

async def create_ticket(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    subject: str,
    category: str,
) -> SupportTicket:
    ticket = SupportTicket(
        account_id=account_id,
        subject=subject,
        category=category,
        status=SUPPORT_STATUS_NEW,
        unread_by_admin=True,
        unread_by_user=False,
    )
    session.add(ticket)
    await session.flush()
    await session.refresh(ticket)
    return ticket


async def get_ticket(
    session: AsyncSession,
    ticket_id: int,
    *,
    with_messages: bool = False,
) -> Optional[SupportTicket]:
    stmt = select(SupportTicket).where(SupportTicket.id == ticket_id)
    if with_messages:
        stmt = stmt.options(
            selectinload(SupportTicket.messages).selectinload(SupportTicketMessage.attachments),
            selectinload(SupportTicket.account).selectinload(Account.telegram_user),
        )
    else:
        stmt = stmt.options(selectinload(SupportTicket.account).selectinload(Account.telegram_user))
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_tickets_for_account(
    session: AsyncSession,
    account_id: uuid.UUID,
    *,
    page: int = 0,
    page_size: int = 50,
) -> Tuple[List[SupportTicket], int]:
    base = select(SupportTicket).where(SupportTicket.account_id == account_id)

    total = await session.scalar(
        select(func.count()).select_from(base.subquery())
    )

    stmt = (
        base.order_by(SupportTicket.last_message_at.desc())
        .offset(page * page_size)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all()), int(total or 0)


async def list_tickets_admin(
    session: AsyncSession,
    *,
    page: int = 0,
    page_size: int = 20,
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> Tuple[List[SupportTicket], int]:
    base = select(SupportTicket)
    if status:
        base = base.where(SupportTicket.status == status)
    if category:
        base = base.where(SupportTicket.category == category)
    if search:
        like = f"%{search.strip()}%"
        base = base.where(SupportTicket.subject.ilike(like))

    total = await session.scalar(select(func.count()).select_from(base.subquery()))

    stmt = (
        base.options(selectinload(SupportTicket.account).selectinload(Account.telegram_user))
        .order_by(
            SupportTicket.unread_by_admin.desc(),
            SupportTicket.last_message_at.desc(),
        )
        .offset(page * page_size)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all()), int(total or 0)


async def count_open_tickets_for_account(session: AsyncSession, account_id: uuid.UUID) -> int:
    total = await session.scalar(
        select(func.count())
        .select_from(SupportTicket)
        .where(
            SupportTicket.account_id == account_id,
            SupportTicket.status != SUPPORT_STATUS_CLOSED,
        )
    )
    return int(total or 0)


async def set_status(session: AsyncSession, ticket: SupportTicket, status: str) -> SupportTicket:
    ticket.status = status
    if status == SUPPORT_STATUS_CLOSED:
        ticket.closed_at = func.now()
    else:
        ticket.closed_at = None
    await session.flush()
    await session.refresh(ticket)
    return ticket


async def mark_read_by_admin(session: AsyncSession, ticket_id: int) -> None:
    await session.execute(
        update(SupportTicket)
        .where(SupportTicket.id == ticket_id)
        .values(unread_by_admin=False)
    )
    await session.flush()


async def mark_read_by_user(session: AsyncSession, ticket_id: int) -> None:
    await session.execute(
        update(SupportTicket)
        .where(SupportTicket.id == ticket_id)
        .values(unread_by_user=False)
    )
    await session.flush()


async def count_unread_for_admin(session: AsyncSession) -> int:
    total = await session.scalar(
        select(func.count()).select_from(SupportTicket).where(SupportTicket.unread_by_admin.is_(True))
    )
    return int(total or 0)


async def count_unread_for_user(session: AsyncSession, account_id: uuid.UUID) -> int:
    total = await session.scalar(
        select(func.count())
        .select_from(SupportTicket)
        .where(
            SupportTicket.account_id == account_id,
            SupportTicket.unread_by_user.is_(True),
        )
    )
    return int(total or 0)


# ─── Messages ────────────────────────────────────────────────────────────────

async def create_message(
    session: AsyncSession,
    *,
    ticket: SupportTicket,
    sender_type: str,
    body: str,
    sender_account_id: Optional[uuid.UUID] = None,
) -> SupportTicketMessage:
    message = SupportTicketMessage(
        ticket_id=ticket.id,
        sender_type=sender_type,
        body=body,
        sender_account_id=sender_account_id,
    )
    session.add(message)

    # Bump the activity timestamp and toggle the unread flag for the other party.
    ticket.last_message_at = func.now()
    if sender_type == SUPPORT_SENDER_USER:
        ticket.unread_by_admin = True
    elif sender_type == SUPPORT_SENDER_ADMIN:
        ticket.unread_by_user = True

    await session.flush()
    await session.refresh(message)
    return message


async def get_messages(
    session: AsyncSession, ticket_id: int
) -> List[SupportTicketMessage]:
    stmt = (
        select(SupportTicketMessage)
        .where(SupportTicketMessage.ticket_id == ticket_id)
        .options(selectinload(SupportTicketMessage.attachments))
        .order_by(SupportTicketMessage.created_at.asc(), SupportTicketMessage.id.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# ─── Attachments ───────────────────────────────────────────────────────────--

async def create_attachment(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    file_path: str,
    url: str,
    content_type: Optional[str] = None,
    file_size: Optional[int] = None,
) -> SupportTicketAttachment:
    attachment = SupportTicketAttachment(
        account_id=account_id,
        file_path=file_path,
        url=url,
        content_type=content_type,
        file_size=file_size,
    )
    session.add(attachment)
    await session.flush()
    await session.refresh(attachment)
    return attachment


async def get_unlinked_attachments(
    session: AsyncSession,
    attachment_ids: Sequence[int],
    account_id: uuid.UUID,
) -> List[SupportTicketAttachment]:
    """Return attachments that belong to the account and are not yet linked to a message."""
    if not attachment_ids:
        return []
    stmt = select(SupportTicketAttachment).where(
        SupportTicketAttachment.id.in_(list(attachment_ids)),
        SupportTicketAttachment.account_id == account_id,
        SupportTicketAttachment.message_id.is_(None),
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def link_attachments_to_message(
    session: AsyncSession,
    attachments: Sequence[SupportTicketAttachment],
    message_id: int,
) -> None:
    for attachment in attachments:
        attachment.message_id = message_id
    await session.flush()
