"""
News API:
  GET  /api/news                    — paginated list of channel posts
  GET  /api/news/stream             — SSE stream (Redis SUBSCRIBE news:new_post)
  GET  /api/news/media/{file_id}    — proxy Telegram media (cached in Redis 1 h)
"""
import asyncio
import json
import logging
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from core.dal.channel_post_dal import (
    count_channel_posts,
    get_channel_post_by_id,
    get_channel_posts,
)
from db.models import ChannelPost
from web.dependencies import get_db, get_redis
from web.schemas.news import ChannelPostResponse, NewsListResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["news"])

_MEDIA_CACHE_TTL = 3600  # 1 hour


def _post_to_dict(post: ChannelPost) -> dict:
    return {
        "id": post.id,
        "telegram_message_id": post.telegram_message_id,
        "channel_id": post.channel_id,
        "text": post.text,
        "entities_json": post.entities_json,
        "media_type": post.media_type,
        "media_file_id": post.media_file_id,
        "media_url": post.media_url,
        "reply_markup_json": post.reply_markup_json,
        "posted_at": post.posted_at.isoformat(),
    }


# ─── GET /api/news ────────────────────────────────────────────────────────────

@router.get("", response_model=NewsListResponse)
async def list_news(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    channel_id = settings.NEWS_CHANNEL_ID
    offset = (page - 1) * limit
    posts = await get_channel_posts(db, channel_id=channel_id, limit=limit, offset=offset)
    total = await count_channel_posts(db, channel_id=channel_id)
    return NewsListResponse(
        posts=[ChannelPostResponse.model_validate(p) for p in posts],
        total=total,
        page=page,
        limit=limit,
    )


# ─── GET /api/news/stream (SSE) ───────────────────────────────────────────────

_SSE_PING_INTERVAL = 3  # seconds; EventSourceResponse sends pings in a separate task


@router.get("/stream")
async def news_stream(
    request: Request,
    redis: Redis = Depends(get_redis),
):
    """
    Server-Sent Events via sse-starlette.

    Key design decisions (from sse-starlette docs):
    - DB session is created INSIDE the generator — Depends(get_db) closes
      the session when the route function returns, before streaming ends.
    - ping= runs in a separate anyio task so pings arrive even when the
      generator blocks on queue.get().
    - X-Accel-Buffering: no passed via headers= disables buffering in
      Nginx and ngrok.
    """

    async def event_generator() -> AsyncGenerator[dict, None]:
        from web.dependencies import _get_session_factory

        pubsub = redis.pubsub()
        await pubsub.subscribe("news:new_post")

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
                    continue  # ping is handled automatically by EventSourceResponse

                if message.get("type") != "message":
                    continue

                try:
                    post_id = int(message["data"])
                except (ValueError, KeyError):
                    continue

                session_factory = _get_session_factory()
                async with session_factory() as session:
                    post = await get_channel_post_by_id(session, post_id)

                if post is None:
                    continue

                payload = json.dumps(_post_to_dict(post), ensure_ascii=False)
                yield {"data": payload}

        except (asyncio.CancelledError, GeneratorExit):
            raise  # sse-starlette requires CancelledError to be re-raised
        finally:
            reader_task.cancel()
            try:
                await pubsub.unsubscribe("news:new_post")
                await pubsub.aclose()
            except Exception:
                pass

    return EventSourceResponse(
        event_generator(),
        ping=_SSE_PING_INTERVAL,
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


# ─── GET /api/news/media/{file_id} ───────────────────────────────────────────

@router.get("/media/{file_id}")
async def get_media(
    file_id: str,
    settings: Settings = Depends(get_settings),
    redis: Redis = Depends(get_redis),
):
    cache_key = f"tg_media_url:{file_id}"

    # Check cache
    cached_url = await redis.get(cache_key)
    if cached_url:
        return await _stream_telegram_file(cached_url)

    # Resolve file path via Telegram API
    bot_token = settings.BOT_TOKEN
    get_file_url = f"https://api.telegram.org/bot{bot_token}/getFile"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(get_file_url, params={"file_id": file_id})
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to resolve Telegram file")

        data = resp.json()
        if not data.get("ok"):
            raise HTTPException(status_code=404, detail="File not found in Telegram")

        file_path = data["result"].get("file_path")
        if not file_path:
            raise HTTPException(status_code=404, detail="Empty file path")

    download_url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"

    # Cache the download URL for 1 hour
    await redis.setex(cache_key, _MEDIA_CACHE_TTL, download_url)

    return await _stream_telegram_file(download_url)


_TELEGRAM_FILE_URL_PREFIX = "https://api.telegram.org/file/bot"


async def _stream_telegram_file(url: str) -> StreamingResponse:
    """Proxy-stream a file from Telegram servers to the client."""
    if not url.startswith(_TELEGRAM_FILE_URL_PREFIX):
        raise HTTPException(status_code=400, detail="Invalid media URL")

    async def _iter_content():
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk

    # Guess content type from URL extension
    ext = url.rsplit(".", 1)[-1].lower() if "." in url else ""
    content_type_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "mp4": "video/mp4",
        "webm": "video/webm",
        "pdf": "application/pdf",
    }
    media_type = content_type_map.get(ext, "application/octet-stream")

    return StreamingResponse(
        _iter_content(),
        media_type=media_type,
        headers={"Cache-Control": f"public, max-age={_MEDIA_CACHE_TTL}"},
    )
