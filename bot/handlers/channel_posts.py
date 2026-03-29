"""
Handler for channel_post updates — captures posts from NEWS_CHANNEL_ID,
saves them to the channel_posts table and publishes to Redis Pub/Sub.
"""
import json
import logging
from typing import Optional

from aiogram import Router
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings

logger = logging.getLogger(__name__)

router = Router(name="channel_posts_router")


def _get_redis(settings: Settings):
    """Lazy-initialised async Redis client (module-level singleton)."""
    global _redis_client
    if _redis_client is None:
        from redis.asyncio import Redis
        _redis_client = Redis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
    return _redis_client


_redis_client = None


def _extract_media(message: Message):
    """Return (media_type, file_id) for the first media in the message."""
    if message.photo:
        return "photo", message.photo[-1].file_id
    if message.video:
        return "video", message.video.file_id
    if message.animation:
        return "animation", message.animation.file_id
    if message.document:
        return "document", message.document.file_id
    return None, None


def _entities_to_json(entities) -> Optional[str]:
    if not entities:
        return None
    try:
        return json.dumps([e.model_dump(exclude_none=True) for e in entities])
    except Exception:
        return None


def _reply_markup_to_json(reply_markup) -> Optional[str]:
    """Serialize InlineKeyboardMarkup buttons (URL buttons only) to JSON."""
    if reply_markup is None:
        return None
    try:
        rows = []
        for row in reply_markup.inline_keyboard:
            buttons = []
            for btn in row:
                if btn.url:
                    buttons.append({"text": btn.text, "url": btn.url})
            if buttons:
                rows.append(buttons)
        return json.dumps(rows, ensure_ascii=False) if rows else None
    except Exception:
        return None


@router.channel_post()
async def handle_channel_post(
    message: Message,
    settings: Settings,
    session: AsyncSession,
):
    if not settings.NEWS_CHANNEL_ID:
        return

    if message.chat.id != settings.NEWS_CHANNEL_ID:
        return

    text = message.text or message.caption
    entities = message.entities or message.caption_entities
    entities_json = _entities_to_json(entities)
    media_type, media_file_id = _extract_media(message)
    reply_markup_json = _reply_markup_to_json(message.reply_markup)

    from core.dal.channel_post_dal import (
        create_channel_post,
        get_channel_post_by_telegram_id,
    )

    # Deduplicate
    existing = await get_channel_post_by_telegram_id(session, message.message_id)
    if existing:
        logger.debug("channel_post %d already stored, skipping", message.message_id)
        return

    try:
        post = await create_channel_post(
            session,
            telegram_message_id=message.message_id,
            channel_id=message.chat.id,
            posted_at=message.date,
            text=text,
            entities_json=entities_json,
            media_type=media_type,
            media_file_id=media_file_id,
            reply_markup_json=reply_markup_json,
        )
        await session.commit()
        logger.info("Saved channel_post id=%d telegram_msg=%d", post.id, message.message_id)
    except Exception as exc:
        logger.error("Failed to save channel_post: %s", exc, exc_info=True)
        return

    # Publish to Redis so SSE clients get notified
    try:
        redis = _get_redis(settings)
        await redis.publish("news:new_post", str(post.id))
        logger.debug("Published news:new_post %d to Redis", post.id)
    except Exception as exc:
        logger.warning("Failed to publish to Redis: %s", exc)
