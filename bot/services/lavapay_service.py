import hashlib
import hmac
import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from aiohttp import web
from aiogram import Bot
from sqlalchemy.orm import sessionmaker

from bot.keyboards.inline.user_keyboards import get_connect_and_main_keyboard
from bot.middlewares.i18n import JsonI18n
from bot.services.notification_service import NotificationService
from bot.services.referral_service import ReferralService
from bot.services.subscription_service import SubscriptionService
from bot.utils.config_link import prepare_config_links
from config.settings import Settings
from db.dal import payment_dal, user_dal


class LavaPayService:
    def __init__(self, *, bot: Bot, settings: Settings, i18n: JsonI18n, async_session_factory: sessionmaker,
                 subscription_service: SubscriptionService, referral_service: ReferralService):
        self.bot = bot
        self.settings = settings
        self.i18n = i18n
        self.async_session_factory = async_session_factory
        self.subscription_service = subscription_service
        self.referral_service = referral_service
        self.configured = bool(settings.LAVAPAY_ENABLED and settings.LAVAPAY_API_KEY and settings.LAVAPAY_PROJECT_ID)
        if not self.configured:
            logging.warning("LavaPayService initialized but not fully configured. Payments disabled.")

    @staticmethod
    def _amount(value: Any) -> Decimal:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def _validate_signature(self, raw_body: bytes, payload: Dict[str, Any], header_signature: str) -> bool:
        secret = self.settings.LAVAPAY_WEBHOOK_SECRET or ""
        if not secret or not header_signature:
            return False
        # Lava documentation says webhook signatures use the additional/webhook key over the unchanged JSON string.
        candidates = [raw_body]
        try:
            candidates.append(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        except Exception:
            pass
        for body in candidates:
            expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
            if hmac.compare_digest(header_signature, expected):
                return True
        return False

    async def webhook_route(self, request: web.Request) -> web.Response:
        if not self.configured:
            return web.json_response({"status": False, "msg": "lavapay_disabled"}, status=503)

        raw = await request.read()
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception as exc:
            logging.error("LavaPay webhook: failed to parse JSON: %s", exc)
            return web.json_response({"status": False, "msg": "bad_request"}, status=400)

        signature = request.headers.get("Signature") or request.headers.get("X-Signature") or ""
        if not isinstance(payload, dict) or not self._validate_signature(raw, payload, signature):
            logging.error("LavaPay webhook: invalid signature or payload")
            return web.json_response({"status": False, "msg": "invalid_signature"}, status=403)

        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        order_id_raw = data.get("orderId") or data.get("order_id")
        invoice_id = str(data.get("invoiceId") or data.get("invoice_id") or data.get("id") or order_id_raw or "")
        status = str(data.get("status") or data.get("paymentStatus") or "").lower()
        amount_raw = data.get("sum") or data.get("amount")
        currency_raw = data.get("currency") or self.settings.LAVAPAY_CURRENCY

        try:
            payment_db_id = int(str(order_id_raw))
        except Exception:
            return web.json_response({"status": False, "msg": "invalid_order_id"}, status=400)

        async with self.async_session_factory() as session:
            payment = await payment_dal.get_payment_by_db_id(session, payment_db_id)
            if not payment:
                logging.error("LavaPay webhook: payment %s not found", payment_db_id)
                return web.json_response({"status": False, "msg": "payment_not_found"}, status=404)

            success_statuses = {"success", "succeeded", "paid", "completed"}
            failed_statuses = {"fail", "failed", "canceled", "cancelled", "expired", "declined"}

            if status in success_statuses:
                if amount_raw is not None and self._amount(amount_raw) != self._amount(payment.amount):
                    return web.json_response({"status": False, "msg": "amount_mismatch"}, status=400)
                if currency_raw and str(currency_raw).upper() != str(payment.currency).upper():
                    return web.json_response({"status": False, "msg": "currency_mismatch"}, status=400)
                if payment.status == "succeeded":
                    return web.json_response({"status": True})
                try:
                    marked = await payment_dal.mark_provider_payment_succeeded_once(session, payment.payment_id, invoice_id)
                    if not marked:
                        return web.json_response({"status": True})
                    payment_months = payment.subscription_duration_months or 1
                    sale_mode = payment.sale_mode or ("traffic" if self.settings.traffic_sale_mode else "subscription")
                    activation = await self.subscription_service.activate_subscription(
                        session, payment.user_id, int(payment_months) if sale_mode != "traffic" else 0,
                        float(payment.amount), payment.payment_id, promo_code_id_from_payment=payment.promo_code_id,
                        provider="lavapay", sale_mode=sale_mode,
                        traffic_gb=payment_months if sale_mode == "traffic" else None,
                    )
                    referral_bonus = None
                    if sale_mode != "traffic":
                        referral_bonus = await self.referral_service.apply_referral_bonuses_for_payment(
                            session, payment.user_id, int(payment_months), current_payment_db_id=payment.payment_id,
                            skip_if_active_before_payment=False,
                        )
                    await session.commit()
                except Exception as exc:
                    await session.rollback()
                    logging.error("LavaPay webhook: failed to process payment %s: %s", invoice_id, exc, exc_info=True)
                    return web.json_response({"status": False, "msg": "processing_error"}, status=500)

                db_user = payment.user or await user_dal.get_user_by_id(session, payment.user_id)
                lang = db_user.language_code if db_user and db_user.language_code else self.settings.DEFAULT_LANGUAGE
                _ = lambda k, **kw: self.i18n.gettext(lang, k, **kw) if self.i18n else k
                raw_config_link = activation.get("subscription_url") if activation else None
                config_link_display, connect_button_url = await prepare_config_links(self.settings, raw_config_link)
                final_end = activation.get("end_date") if activation else None
                if referral_bonus and referral_bonus.get("referee_new_end_date"):
                    final_end = referral_bonus["referee_new_end_date"]
                text = _("payment_successful_full", months=payment_months, end_date=final_end.strftime("%Y-%m-%d") if final_end else "", config_link=config_link_display or _("config_link_not_available"))
                try:
                    await self.bot.send_message(payment.user_id, text, reply_markup=get_connect_and_main_keyboard(lang, self.i18n, self.settings, config_link_display, connect_button_url=connect_button_url, preserve_message=True), parse_mode="HTML", disable_web_page_preview=True)
                except Exception as exc:
                    logging.error("LavaPay webhook: failed to notify user %s: %s", payment.user_id, exc)
                try:
                    await NotificationService(self.bot, self.settings, self.i18n).notify_payment_received(user_id=payment.user_id, amount=float(payment.amount), currency=payment.currency, months=int(payment_months), payment_provider="lavapay", username=db_user.username if db_user else None)
                except Exception as exc:
                    logging.error("LavaPay webhook: failed to notify admins: %s", exc)
                return web.json_response({"status": True})

            if status in failed_statuses:
                await payment_dal.update_provider_payment_and_status(session, payment.payment_id, invoice_id, "failed")
                await session.commit()
                return web.json_response({"status": True})

            await payment_dal.update_provider_payment_and_status(session, payment.payment_id, invoice_id, "pending_lavapay")
            await session.commit()
            return web.json_response({"status": True})


async def lavapay_webhook_route(request: web.Request) -> web.Response:
    service: LavaPayService = request.app["lavapay_service"]
    return await service.webhook_route(request)
