"""
Listens on the Redis 'broadcast:request' pub/sub channel and
executes admin broadcasts triggered from the web admin panel.
"""
import asyncio
import json
import logging
from typing import Optional

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from redis.asyncio import Redis
from sqlalchemy.orm import sessionmaker

from config.settings import Settings
from core.dal import user_dal

logger = logging.getLogger(__name__)

_STATUS_TTL = 3600  # Redis key TTL in seconds
_RATE_LIMIT_DELAY = 0.05  # 20 msg/s to stay under Telegram's limit
_STATUS_UPDATE_EVERY = 20  # update Redis status every N messages


def _build_keyboard(buttons: list) -> Optional[InlineKeyboardMarkup]:
    """Build InlineKeyboardMarkup from broadcast button list grouped by row index.

    The optional ``color`` field maps directly to the Bot API 9.4 ``style`` field:
    'danger' → red, 'success' → green, 'primary' → blue.
    """
    if not buttons:
        return None

    rows: dict[int, list[InlineKeyboardButton]] = {}
    for btn in buttons:
        text = (btn.get("text") or "").strip()
        url = (btn.get("url") or "").strip()
        if not text or not url:
            continue
        row_idx = int(btn.get("row", 0))
        color = (btn.get("color") or "").strip()  # "", "danger", "success", "primary"
        kb_btn = InlineKeyboardButton(
            text=text,
            url=url,
            **({"style": color} if color else {}),
        )
        rows.setdefault(row_idx, []).append(kb_btn)

    if not rows:
        return None

    keyboard = [rows[idx] for idx in sorted(rows)]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


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

    def _build_broadcast_bots(self) -> list[tuple[str, Bot, bool]]:
        """Return all bots that should be used for a web-admin broadcast.

        The primary app bot is reused to avoid reopening its session. Additional
        tokens from BROADCAST_BOT_TOKENS get short-lived Bot instances; send
        errors are handled per chat/token attempt by _execute.
        """
        bots: list[tuple[str, Bot, bool]] = []
        primary_token = (self.settings.BOT_TOKEN or "").strip()
        default_props = DefaultBotProperties(parse_mode=ParseMode.HTML)

        for token in self.settings.BROADCAST_TOKENS:
            if token == primary_token:
                bots.append((token, self.bot, False))
                continue

            session = None
            if self.settings.TELEGRAM_PROXY_URL:
                session = AiohttpSession(proxy=self.settings.TELEGRAM_PROXY_URL)
            bots.append((token, Bot(token=token, default=default_props, session=session), True))

        return bots

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
        # The channel is idle most of the time. We poll with get_message(timeout=)
        # rather than the blocking listen() generator: on an idle timeout
        # get_message returns None instead of raising, so a quiet channel is not
        # mistaken for a dropped connection. The outer loop reconnects (with
        # backoff) only on a genuine connection error.
        backoff = 1
        while True:
            redis = Redis.from_url(
                self.settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_keepalive=True,
            )
            pubsub = redis.pubsub()
            try:
                await pubsub.subscribe("broadcast:request")
                logger.info("WebBroadcastService: subscribed to broadcast:request")
                backoff = 1  # reset after a successful (re)subscribe

                while True:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if not message or message.get("type") != "message":
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
                logger.warning(
                    "WebBroadcastService: listener connection lost (%s); reconnecting in %ss",
                    exc, backoff,
                )
            finally:
                try:
                    await pubsub.aclose()
                except Exception:
                    pass
                try:
                    await redis.aclose()
                except Exception:
                    pass

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

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
        buttons_raw = data.get("buttons", [])

        if not broadcast_id or not text:
            logger.warning("WebBroadcastService: invalid broadcast payload: %s", data)
            return

        keyboard = _build_keyboard(buttons_raw)

        logger.info(
            "WebBroadcastService: starting broadcast %s filter=%s buttons=%d",
            broadcast_id,
            filter_type,
            len(buttons_raw),
        )

        try:
            async with self.async_session_factory() as session:
                if filter_type == "active":
                    user_ids = await user_dal.get_user_ids_with_active_subscription(session)
                elif filter_type == "inactive":
                    user_ids = await user_dal.get_user_ids_without_active_subscription(session)
                else:
                    user_ids = await user_dal.get_all_active_user_ids_for_broadcast(session)

            broadcast_bots = self._build_broadcast_bots()
            total = len(user_ids) * len(broadcast_bots)
            await self._set_status(
                redis, broadcast_id, {"status": "running", "total": total, "sent": 0, "failed": 0}
            )

            sent = 0
            failed = 0

            try:
                for uid in user_ids:
                    for token, bot, _should_close in broadcast_bots:
                        try:
                            await bot.send_message(
                                chat_id=uid,
                                text=text,
                                parse_mode="HTML",
                                disable_web_page_preview=True,
                                reply_markup=keyboard,
                            )
                            sent += 1
                        except Exception as exc:
                            failed += 1
                            token_id = token.split(":", 1)[0]
                            logger.debug(
                                "Broadcast %s: bot %s failed to send to %d: %s",
                                broadcast_id,
                                token_id,
                                uid,
                                exc,
                            )

                        if (sent + failed) % _STATUS_UPDATE_EVERY == 0:
                            await self._set_status(
                                redis,
                                broadcast_id,
                                {"status": "running", "total": total, "sent": sent, "failed": failed},
                            )

                        await asyncio.sleep(_RATE_LIMIT_DELAY)
            finally:
                for _token, bot, should_close in broadcast_bots:
                    if should_close:
                        await bot.session.close()

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
