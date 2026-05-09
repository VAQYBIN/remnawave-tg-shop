from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from datetime import datetime

from db.models import ChannelPost


async def create_channel_post(
    session: AsyncSession,
    telegram_message_id: int,
    channel_id: int,
    posted_at: datetime,
    text: Optional[str] = None,
    entities_json: Optional[str] = None,
    media_type: Optional[str] = None,
    media_file_id: Optional[str] = None,
    media_url: Optional[str] = None,
    reply_markup_json: Optional[str] = None,
) -> ChannelPost:
    post = ChannelPost(
        telegram_message_id=telegram_message_id,
        channel_id=channel_id,
        text=text,
        entities_json=entities_json,
        media_type=media_type,
        media_file_id=media_file_id,
        media_url=media_url,
        reply_markup_json=reply_markup_json,
        posted_at=posted_at,
    )
    session.add(post)
    await session.flush()
    await session.refresh(post)
    return post


async def get_channel_post_by_telegram_id(
    session: AsyncSession, telegram_message_id: int
) -> Optional[ChannelPost]:
    result = await session.execute(
        select(ChannelPost).where(ChannelPost.telegram_message_id == telegram_message_id)
    )
    return result.scalar_one_or_none()


async def get_channel_post_by_id(session: AsyncSession, post_id: int) -> Optional[ChannelPost]:
    result = await session.execute(select(ChannelPost).where(ChannelPost.id == post_id))
    return result.scalar_one_or_none()


async def get_channel_posts(
    session: AsyncSession,
    channel_id: Optional[int] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[ChannelPost]:
    query = select(ChannelPost).order_by(desc(ChannelPost.posted_at)).limit(limit).offset(offset)
    if channel_id is not None:
        query = query.where(ChannelPost.channel_id == channel_id)
    result = await session.execute(query)
    return list(result.scalars().all())


async def count_channel_posts(session: AsyncSession, channel_id: Optional[int] = None) -> int:
    from sqlalchemy import func
    query = select(func.count(ChannelPost.id))
    if channel_id is not None:
        query = query.where(ChannelPost.channel_id == channel_id)
    result = await session.execute(query)
    return result.scalar_one()
