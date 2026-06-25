"""
Listens on the Redis 'support:admin' pub/sub channel and notifies admins in
Telegram about new support tickets and new user replies opened from the web.
"""
import asyncio
import json
import logging
import html
from typing import Optional

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from redis.asyncio import Redis

from config.settings import Settings
from core.services.support_core import CHANNEL_ADMIN

logger = logging.getLogger(__name__)

_CATEGORY_LABELS = {
    "payment": "Оплата и платежи",
    "connection": "Подключение / VPN",
    "subscription": "Подписка и тарифы",
    "other": "Другое",
}


class SupportNotifyService:
    def __init__(self, bot: Bot, settings: Settings):
        self.bot = bot
        self.settings = settings
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._listen(), name="support-notify-listener")
        logger.info("SupportNotifyService: listener started")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SupportNotifyService: stopped")

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
                await pubsub.subscribe(CHANNEL_ADMIN)
                logger.info("SupportNotifyService: subscribed to %s", CHANNEL_ADMIN)
                backoff = 1  # reset after a successful (re)subscribe

                while True:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if not message or message.get("type") != "message":
                        continue
                    try:
                        data = json.loads(message["data"])
                        await self._notify(data)
                    except Exception as exc:
                        logger.error("SupportNotifyService: failed to handle message: %s", exc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "SupportNotifyService: listener connection lost (%s); reconnecting in %ss",
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

    async def _notify(self, data: dict) -> None:
        event = data.get("event")
        # Only push a Telegram ping for events that need admin attention.
        if event not in ("new_ticket", "new_message"):
            return

        ticket_id = data.get("ticket_id")
        subject = html.escape(str(data.get("subject", "")))
        category = _CATEGORY_LABELS.get(data.get("category", ""), data.get("category", ""))
        account_label = html.escape(str(data.get("account_label", "—")))
        preview = html.escape(str(data.get("preview", "")))

        if event == "new_ticket":
            header = f"🆕 Новое обращение №{ticket_id}"
        else:
            header = f"💬 Новое сообщение в обращении №{ticket_id}"

        text = (
            f"<b>{header}</b>\n"
            f"<b>Тема:</b> {subject}\n"
            f"<b>Категория:</b> {html.escape(str(category))}\n"
            f"<b>Пользователь:</b> {account_label}\n"
        )
        if preview:
            text += f"\n{preview}"

        keyboard = self._build_keyboard(ticket_id)

        for admin_id in self.settings.ADMIN_IDS:
            try:
                await self.bot.send_message(
                    chat_id=admin_id,
                    text=text,
                    parse_mode="HTML",
                    disable_web_page_preview=True,
                    reply_markup=keyboard,
                )
            except Exception as exc:
                logger.debug("SupportNotifyService: failed to notify admin %s: %s", admin_id, exc)

    def _build_keyboard(self, ticket_id) -> Optional[InlineKeyboardMarkup]:
        base = (self.settings.WEB_FRONTEND_URL or "").rstrip("/")
        if not base or ticket_id is None:
            return None
        url = f"{base}/admin/support/{ticket_id}"
        return InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Открыть в панели", url=url)]]
        )
