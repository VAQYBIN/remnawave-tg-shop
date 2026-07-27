import json
import logging
import hmac
import hashlib
from aiohttp import web
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup
from sqlalchemy.orm import sessionmaker
from typing import Optional
from config.settings import Settings
from .panel_api_service import PanelApiService
from bot.middlewares.i18n import JsonI18n
from bot.keyboards.inline.user_keyboards import get_subscribe_only_markup, get_autorenew_cancel_keyboard
from db.dal import user_dal
from core.dal import account_dal
from core.services.notification_email_service import (
    KIND_EXPIRED,
    KIND_EXPIRED_YESTERDAY,
    KIND_PRE_EXPIRY,
    send_expiry_email,
)
from core.services.unsubscribe_token import create_unsubscribe_token

# Legacy discrete expiry events (Remnawave < 2.8.0).
EVENT_MAP = {
    "user.expires_in_72_hours": (3, "subscription_72h_notification"),
    "user.expires_in_48_hours": (2, "subscription_48h_notification"),
    "user.expires_in_24_hours": (1, "subscription_24h_notification"),
}

# Remnawave >= 2.8.0 consolidated the discrete events into a single
# `user.expiration` event carrying `meta.expiration` — a signed hour offset
# (negative = before expiry, positive = after expiry). Map the pre-expiry
# offsets back onto the legacy (days_left, message_key) semantics.
# Requires panel .env: EXPIRATION_NOTIFICATIONS_ENABLED=true and
# EXPIRATION_NOTIFICATIONS=[-72,-48,-24,24].
EXPIRATION_OFFSET_MAP = {
    -72: (3, "subscription_72h_notification"),
    -48: (2, "subscription_48h_notification"),
    -24: (1, "subscription_24h_notification"),
}

class PanelWebhookService:
    def __init__(self, bot: Bot, settings: Settings, i18n: JsonI18n, async_session_factory: sessionmaker, panel_service: PanelApiService):
        self.bot = bot
        self.settings = settings
        self.i18n = i18n
        self.async_session_factory = async_session_factory
        self.panel_service = panel_service

    async def _subscription_auto_renew_enabled(self, session, sub) -> bool:
        if not sub or sub.provider != "yookassa":
            return False
        if getattr(sub, "pricing_plan_option_id", None):
            from core.dal.plan_entitlement_dal import get_active_standalone_entitlement
            ent = await get_active_standalone_entitlement(session, sub.user_id)
            return bool(ent and ent.auto_renew_enabled)
        return bool(sub.auto_renew_enabled)

    async def _send_message(
        self,
        user_id: int,
        lang: str,
        message_key: str,
        reply_markup: InlineKeyboardMarkup | None = None,
        **kwargs,
    ):
        _ = lambda k, **kw: self.i18n.gettext(lang, k, **kw)
        try:
            await self.bot.send_message(
                user_id, _(message_key, **kwargs), reply_markup=reply_markup
            )
        except Exception as e:
            logging.error(f"Failed to send notification to {user_id}: {e}")

    async def _get_brand_name(self) -> str:
        try:
            async with self.async_session_factory() as session:
                from core.dal.site_settings_dal import get_site_settings

                site = await get_site_settings(session)
                return site.brand_name or "VPN"
        except Exception:
            logging.exception("Brand name lookup failed; falling back to default")
            return "VPN"

    async def _maybe_send_expiry_email(
        self, account, *, kind: str, days_left: int, end_date: str
    ) -> None:
        """Отправляет письмо, если аккаунт подходит; любые ошибки — только лог."""
        try:
            if account is None or not account.email or not account.is_email_verified:
                return
            if not getattr(account, "email_notifications_enabled", True):
                return
            if not getattr(self.settings, "EMAIL_EXPIRY_NOTIFICATIONS_ENABLED", True):
                return
            if not getattr(self.settings, "RESEND_API_KEY", None):
                return
            unsubscribe_url = None
            secret = getattr(self.settings, "WEB_JWT_SECRET", None)
            if secret:
                token = create_unsubscribe_token(account.id, secret)
                unsubscribe_url = (
                    f"{self.settings.WEB_API_URL}/api/profile/unsubscribe?token={token}"
                )
            brand = await self._get_brand_name()
            await send_expiry_email(
                email=account.email,
                kind=kind,
                days_left=days_left,
                lang=account.language_code or self.settings.DEFAULT_LANGUAGE,
                brand=brand,
                end_date=end_date,
                renew_url=f"{self.settings.WEB_FRONTEND_URL}/subscription",
                api_key=self.settings.RESEND_API_KEY,
                from_email=self.settings.RESEND_FROM_EMAIL,
                unsubscribe_url=unsubscribe_url,
            )
        except Exception:
            logging.exception("Expiry email dispatch failed")

    async def handle_event(self, event_name: str, user_payload: dict, meta: Optional[dict] = None):
        telegram_id = user_payload.get("telegramId")
        tg_user_id = int(telegram_id) if telegram_id else None

        if not self.settings.SUBSCRIPTION_NOTIFICATIONS_ENABLED:
            return

        # Normalize expiry notifications across Remnawave versions:
        #  - < 2.8.0: discrete events (user.expires_in_*h, user.expired_24_hours_ago)
        #  - >= 2.8.0: single user.expiration event + meta.expiration (signed hours)
        pre_expiry: Optional[tuple] = None   # (days_left, message_key)
        expired_after = False                # post-expiry reminder (e.g. +24h)

        if event_name in EVENT_MAP:
            pre_expiry = EVENT_MAP[event_name]
        elif event_name == "user.expired_24_hours_ago":
            expired_after = True
        elif event_name == "user.expiration":
            offset = meta.get("expiration") if isinstance(meta, dict) else None
            try:
                offset = int(offset) if offset is not None else None
            except (TypeError, ValueError):
                offset = None
            if offset is None:
                logging.warning(
                    "user.expiration webhook missing/invalid meta.expiration; ignoring"
                )
                return
            if offset in EXPIRATION_OFFSET_MAP:
                pre_expiry = EXPIRATION_OFFSET_MAP[offset]
            elif offset > 0:
                expired_after = True
            else:
                logging.info(
                    "user.expiration offset %s has no configured notification; ignoring",
                    offset,
                )
                return

        # Identity resolution: telegram users keep the legacy path; web-only
        # users (no telegramId) are matched by panel username "web_<hex>" →
        # users.username → account.site_user_id. Email channel needs Account.
        account = None
        async with self.async_session_factory() as session:
            if tg_user_id:
                db_user = await user_dal.get_user_by_id(session, tg_user_id)
                lang = db_user.language_code if db_user and db_user.language_code else self.settings.DEFAULT_LANGUAGE
                first_name = db_user.first_name or f"User {tg_user_id}" if db_user else f"User {tg_user_id}"
                try:
                    account = await account_dal.get_account_by_telegram_id(session, tg_user_id)
                except Exception:
                    logging.exception("Account lookup by telegram id failed")
            else:
                username = user_payload.get("username")
                if username:
                    try:
                        site_user = await user_dal.get_user_by_username(session, username)
                        if site_user:
                            account = await account_dal.get_account_by_site_user_id(
                                session, site_user.user_id
                            )
                    except Exception:
                        logging.exception("Account lookup by panel username failed")
                if account is None:
                    logging.warning(
                        "Panel webhook without telegramId has no matching web account; ignoring"
                    )
                    return
                lang = account.language_code or self.settings.DEFAULT_LANGUAGE
                first_name = (account.email or "").split("@")[0]

        user_id = tg_user_id if tg_user_id is not None else account.site_user_id
        end_date = user_payload.get("expireAt", "")[:10]
        markup = get_subscribe_only_markup(lang, self.i18n) if tg_user_id else None

        if pre_expiry is not None:
            days_left, msg_key = pre_expiry
            if days_left == 1:
                # Trigger auto-renew via SubscriptionService (wired in at factory)
                try:
                    subscription_service = getattr(self, "subscription_service", None)
                    if subscription_service:
                        async with self.async_session_factory() as session:
                            from db.dal import subscription_dal
                            sub = await subscription_dal.get_active_subscription_by_user_id(session, user_id)
                            if sub and await self._subscription_auto_renew_enabled(session, sub):
                                try:
                                    ok = await subscription_service.charge_subscription_renewal(session, sub)
                                    # If initiation succeeded, suppress the 24h reminder by returning early
                                    if ok:
                                        await session.commit()
                                        return
                                    else:
                                        await session.rollback()
                                except Exception:
                                    await session.rollback()
                                    logging.exception("Auto-renew attempt (24h) failed")
                except Exception:
                    logging.exception("Auto-renew trigger (24h) failed pre-check")
            if days_left <= self.settings.SUBSCRIPTION_NOTIFY_DAYS_BEFORE:
                # For 48h event, if auto-renew is enabled, show special notice with cancel button
                if days_left == 2:
                    async with self.async_session_factory() as session:
                        from db.dal import subscription_dal
                        sub = await subscription_dal.get_active_subscription_by_user_id(session, user_id)
                        logging.info(
                            "48h webhook check: user_id=%s sub_found=%s auto_renew=%s provider=%s",
                            user_id,
                            bool(sub),
                            getattr(sub, 'auto_renew_enabled', None) if sub else None,
                            getattr(sub, 'provider', None) if sub else None,
                        )
                        if sub and await self._subscription_auto_renew_enabled(session, sub):
                            if tg_user_id:
                                cancel_kb = get_autorenew_cancel_keyboard(lang, self.i18n)
                                await self._send_message(
                                    tg_user_id,
                                    lang,
                                    "autorenew_48h_charge_tomorrow_notice",
                                    reply_markup=cancel_kb,
                                    user_name=first_name,
                                )
                            # Auto-renew charges tomorrow — an "expires soon"
                            # email would be misleading, so skip it too.
                            return
                if tg_user_id:
                    await self._send_message(
                        tg_user_id,
                        lang,
                        msg_key,
                        reply_markup=markup,
                        user_name=first_name,
                        end_date=end_date,
                    )
                await self._maybe_send_expiry_email(
                    account, kind=KIND_PRE_EXPIRY, days_left=days_left, end_date=end_date
                )
        elif event_name == "user.expired":
            if self.settings.SUBSCRIPTION_NOTIFY_ON_EXPIRE:
                if tg_user_id:
                    await self._send_message(
                        tg_user_id,
                        lang,
                        "subscription_expired_notification",
                        reply_markup=markup,
                        user_name=first_name,
                        end_date=end_date,
                    )
                await self._maybe_send_expiry_email(
                    account, kind=KIND_EXPIRED, days_left=0, end_date=end_date
                )
        elif expired_after and self.settings.SUBSCRIPTION_NOTIFY_AFTER_EXPIRE:
            if tg_user_id:
                await self._send_message(
                    tg_user_id,
                    lang,
                    "subscription_expired_yesterday_notification",
                    reply_markup=markup,
                    user_name=first_name,
                    end_date=end_date,
                )
            await self._maybe_send_expiry_email(
                account, kind=KIND_EXPIRED_YESTERDAY, days_left=0, end_date=end_date
            )

    async def handle_webhook(self, raw_body: bytes, signature_header: Optional[str]) -> web.Response:
        if not self.settings.PANEL_WEBHOOK_SECRET:
            logging.critical("Panel webhook rejected: PANEL_WEBHOOK_SECRET is not configured")
            return web.Response(status=503, text="panel_webhook_secret_required")

        if not signature_header:
            return web.Response(status=403, text="no_signature")
        expected_sig = hmac.new(
            self.settings.PANEL_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, signature_header):
            return web.Response(status=403, text="invalid_signature")

        try:
            payload = json.loads(raw_body.decode())
        except Exception:
            return web.Response(status=400, text="bad_request")

        event_name = payload.get("name") or payload.get("event")
        user_data = payload.get("payload") or payload.get("data", {})
        if isinstance(user_data, dict) and "user" in user_data:
            user_data = user_data.get("user") or user_data
        # Remnawave >= 2.8.0 carries the signed expiry offset in top-level meta.
        meta = payload.get("meta") if isinstance(payload, dict) else None

        telegram_id = user_data.get("telegramId") if isinstance(user_data, dict) else None

        if not event_name:
            return web.Response(status=200, text="ok_no_event")

        logging.info(
            "Panel webhook event received: %s; telegramId=%s",
            event_name,
            telegram_id if telegram_id is not None else "N/A",
        )

        await self.handle_event(event_name, user_data, meta)
        return web.Response(status=200, text="ok")

async def panel_webhook_route(request: web.Request):
    service: PanelWebhookService = request.app["panel_webhook_service"]
    raw = await request.read()
    signature_header = request.headers.get("X-Remnawave-Signature")
    return await service.handle_webhook(raw, signature_header)
