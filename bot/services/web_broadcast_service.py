"""
Listens on the Redis 'broadcast:request' pub/sub channel and
executes admin broadcasts triggered from the web admin panel.
"""
import asyncio
import json
import logging
from typing import Optional

from aiogram import Bot
from redis.asyncio import Redis
from sqlalchemy.orm import sessionmaker

from config.settings import Settings
from core.dal import user_dal

logger = logging.getLogger(__name__)

_STATUS_TTL = 3600  # Redis key TTL in seconds
_RATE_LIMIT_DELAY = 0.05  # 20 msg/s to stay under Telegram's limit
_STATUS_UPDATE_EVERY = 20  # update Redis status every N messages


class WebBroadcastService:
    def __init__(
        self,
        bot: Bot,
        settings: Settings,
        async_session_factory: sessionmaker,
    ):
        self.bot = bot
        self.settings = settings
        self.async_session_factory = async_session_factory
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._listen(), name="web-broadcast-listener")
        logger.info("WebBroadcastService: listener started")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("WebBroadcastService: stopped")

    async def _listen(self) -> None:
        redis = Redis.from_url(
            self.settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe("broadcast:request")
            logger.info("WebBroadcastService: subscribed to broadcast:request")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    asyncio.create_task(
                        self._execute(redis, data),
                        name=f"broadcast-{data.get('id', 'unknown')}",
                    )
                except Exception as exc:
                    logger.error("WebBroadcastService: failed to parse message: %s", exc)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("WebBroadcastService: listener crashed: %s", exc, exc_info=True)
        finally:
            try:
                await pubsub.unsubscribe("broadcast:request")
                await redis.aclose()
            except Exception:
                pass

    async def _set_status(self, redis: Redis, broadcast_id: str, data: dict) -> None:
        await redis.set(
            f"broadcast:status:{broadcast_id}",
            json.dumps(data),
            ex=_STATUS_TTL,
        )

    async def _execute(self, redis: Redis, data: dict) -> None:
        broadcast_id = data.get("id")
        text = data.get("text", "").strip()
        filter_type = data.get("filter", "all")

        if not broadcast_id or not text:
            logger.warning("WebBroadcastService: invalid broadcast payload: %s", data)
            return

        logger.info(
            "WebBroadcastService: starting broadcast %s filter=%s", broadcast_id, filter_type
        )

        try:
            async with self.async_session_factory() as session:
                if filter_type == "active":
                    user_ids = await user_dal.get_user_ids_with_active_subscription(session)
                elif filter_type == "inactive":
                    user_ids = await user_dal.get_user_ids_without_active_subscription(session)
                else:
                    user_ids = await user_dal.get_all_active_user_ids_for_broadcast(session)

            total = len(user_ids)
            await self._set_status(
                redis, broadcast_id, {"status": "running", "total": total, "sent": 0, "failed": 0}
            )

            sent = 0
            failed = 0

            for uid in user_ids:
                try:
                    await self.bot.send_message(
                        chat_id=uid,
                        text=text,
                        parse_mode="HTML",
                        disable_web_page_preview=True,
                    )
                    sent += 1
                except Exception as exc:
                    failed += 1
                    logger.debug("Broadcast %s: failed to send to %d: %s", broadcast_id, uid, exc)

                if (sent + failed) % _STATUS_UPDATE_EVERY == 0:
                    await self._set_status(
                        redis,
                        broadcast_id,
                        {"status": "running", "total": total, "sent": sent, "failed": failed},
                    )

                await asyncio.sleep(_RATE_LIMIT_DELAY)

            await self._set_status(
                redis,
                broadcast_id,
                {"status": "completed", "total": total, "sent": sent, "failed": failed},
            )
            logger.info(
                "WebBroadcastService: broadcast %s done — sent=%d failed=%d",
                broadcast_id,
                sent,
                failed,
            )

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(
                "WebBroadcastService: broadcast %s crashed: %s", broadcast_id, exc, exc_info=True
            )
            await self._set_status(
                redis,
                broadcast_id,
                {"status": "failed", "total": 0, "sent": 0, "failed": 0, "error": str(exc)[:200]},
            )
