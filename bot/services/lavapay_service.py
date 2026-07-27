"""LavaPay (Lava Business) — создание счетов и обработка вебхуков в боте.

Подпись вебхука обязательна: без ``LAVAPAY_WEBHOOK_SECRET`` сервис считается
ненастроенным и уведомления не принимаются вовсе (fail-closed). Протокол —
см. core/services/lava_client.py.
"""
import json
import logging
from typing import Any, Dict, Optional

from aiogram import Bot
from aiohttp import web
from sqlalchemy.orm import sessionmaker

from bot.keyboards.inline.user_keyboards import get_connect_and_main_keyboard
from bot.middlewares.i18n import JsonI18n
from bot.services.notification_service import NotificationService
from bot.services.referral_service import ReferralService
from bot.services.subscription_service import SubscriptionService
from bot.utils.config_link import prepare_config_links
from config.settings import Settings
from core.services.lava_client import (
    WEBHOOK_SIGNATURE_HEADERS,
    LavaClient,
    amount_to_decimal,
    is_configured,
    map_invoice_status,
)
from db.dal import payment_dal, user_dal

PROVIDER = "lavapay"


class LavaPayService:
    def __init__(
        self,
        *,
        bot: Bot,
        settings: Settings,
        i18n: JsonI18n,
        async_session_factory: sessionmaker,
        subscription_service: SubscriptionService,
        referral_service: ReferralService,
        default_return_url: str,
    ):
        self.bot = bot
        self.settings = settings
        self.i18n = i18n
        self.async_session_factory = async_session_factory
        self.subscription_service = subscription_service
        self.referral_service = referral_service
        self.default_return_url = f"https://t.me/{default_return_url}"
        self.client = LavaClient(settings)

        self.configured: bool = is_configured(settings)
        if settings.LAVAPAY_ENABLED and not self.configured:
            logging.warning(
                "LavaPayService: провайдер включён, но не настроен "
                "(нужны LAVAPAY_SHOP_ID, LAVAPAY_SECRET_KEY, LAVAPAY_WEBHOOK_SECRET). Оплата отключена."
            )

    @property
    def webhook_url(self) -> Optional[str]:
        base = (self.settings.WEBHOOK_BASE_URL or "").rstrip("/")
        return f"{base}/webhook/lavapay" if base else None

    async def create_invoice(
        self,
        *,
        payment_db_id: int,
        amount: float,
        description: Optional[str] = None,
        return_url: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        """Создаёт счёт в Lava. Возвращает {"invoice_id", "url"} либо None."""
        if not self.configured:
            logging.error("LavaPay: попытка создать счёт при ненастроенном провайдере")
            return None
        try:
            return await self.client.create_invoice(
                amount=amount,
                order_id=str(payment_db_id),
                hook_url=self.webhook_url,
                success_url=return_url or self.default_return_url,
                comment=description,
                custom_fields=str(payment_db_id),
            )
        except Exception as exc:
            logging.error("LavaPay: не удалось создать счёт для платежа %s: %s", payment_db_id, exc)
            return None

    # ── Webhook ──────────────────────────────────────────────────────────────
    def _extract_signature(self, request: web.Request) -> str:
        for header in WEBHOOK_SIGNATURE_HEADERS:
            value = request.headers.get(header)
            if value:
                return value
        return ""

    async def webhook_route(self, request: web.Request) -> web.Response:
        if not self.configured:
            return web.json_response({"status": False, "msg": "lavapay_disabled"}, status=503)

        raw_body = await request.read()
        if not self.client.verify_webhook_signature(raw_body, self._extract_signature(request)):
            return web.json_response({"status": False, "msg": "invalid_signature"}, status=403)

        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except Exception as exc:
            logging.error("LavaPay webhook: не удалось разобрать JSON: %s", exc)
            return web.json_response({"status": False, "msg": "bad_request"}, status=400)

        if not isinstance(payload, dict):
            return web.json_response({"status": False, "msg": "bad_request"}, status=400)

        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        order_id_raw = data.get("order_id") or data.get("orderId")
        invoice_id = str(data.get("invoice_id") or data.get("invoiceId") or data.get("id") or "")
        status = map_invoice_status(data.get("status"))
        amount_raw = data.get("amount") if data.get("amount") is not None else data.get("sum")

        try:
            payment_db_id = int(str(order_id_raw))
        except (TypeError, ValueError):
            logging.error("LavaPay webhook: некорректный order_id %r", order_id_raw)
            return web.json_response({"status": False, "msg": "invalid_order_id"}, status=400)

        async with self.async_session_factory() as session:
            payment = await payment_dal.get_payment_by_db_id(session, payment_db_id)
            if not payment:
                logging.error("LavaPay webhook: платёж %s не найден", payment_db_id)
                return web.json_response({"status": False, "msg": "payment_not_found"}, status=404)

            if payment.provider and payment.provider != PROVIDER:
                logging.error(
                    "LavaPay webhook: платёж %s принадлежит провайдеру %s",
                    payment_db_id, payment.provider,
                )
                return web.json_response({"status": False, "msg": "provider_mismatch"}, status=400)

            if status == "pending":
                await payment_dal.update_provider_payment_and_status(
                    session, payment.payment_id, invoice_id or str(payment.payment_id), "pending_lavapay"
                )
                await session.commit()
                return web.json_response({"status": True})

            if status == "failed":
                await payment_dal.update_provider_payment_and_status(
                    session, payment.payment_id, invoice_id or str(payment.payment_id), "failed"
                )
                await session.commit()
                return web.json_response({"status": True})

            # status == "succeeded"
            if payment.status == "succeeded":
                return web.json_response({"status": True})

            if amount_raw is None:
                logging.error("LavaPay webhook: платёж %s без суммы в уведомлении", payment_db_id)
                return web.json_response({"status": False, "msg": "amount_missing"}, status=400)
            try:
                incoming_amount = amount_to_decimal(amount_raw)
                expected_amount = amount_to_decimal(payment.amount)
            except Exception as exc:
                logging.error("LavaPay webhook: не удалось сравнить суммы платежа %s: %s", payment_db_id, exc)
                return web.json_response({"status": False, "msg": "amount_validation_error"}, status=400)
            if incoming_amount != expected_amount:
                logging.error(
                    "LavaPay webhook: сумма не совпала для платежа %s (ожидалось %s, пришло %s)",
                    payment_db_id, expected_amount, incoming_amount,
                )
                return web.json_response({"status": False, "msg": "amount_mismatch"}, status=400)

            payment_months = payment.subscription_duration_months or 1
            sale_mode = "traffic" if self.settings.traffic_sale_mode else "subscription"
            try:
                marked = await payment_dal.mark_provider_payment_succeeded_once(
                    session, payment.payment_id, invoice_id or str(payment.payment_id)
                )
                if not marked:
                    logging.info("LavaPay webhook: платёж %s уже обработан", payment.payment_id)
                    return web.json_response({"status": True})

                activation = await self.subscription_service.activate_subscription(
                    session,
                    payment.user_id,
                    int(payment_months) if sale_mode != "traffic" else 0,
                    float(payment.amount),
                    payment.payment_id,
                    promo_code_id_from_payment=payment.promo_code_id,
                    provider=PROVIDER,
                    sale_mode=sale_mode,
                    traffic_gb=payment_months if sale_mode == "traffic" else None,
                )

                referral_bonus = None
                if sale_mode != "traffic":
                    referral_bonus = await self.referral_service.apply_referral_bonuses_for_payment(
                        session,
                        payment.user_id,
                        int(payment_months),
                        current_payment_db_id=payment.payment_id,
                        skip_if_active_before_payment=False,
                    )
                await session.commit()
            except Exception as exc:
                await session.rollback()
                logging.error(
                    "LavaPay webhook: ошибка обработки платежа %s: %s", payment.payment_id, exc, exc_info=True
                )
                return web.json_response({"status": False, "msg": "processing_error"}, status=500)

            await self._notify_success(session, payment, activation, referral_bonus, payment_months, sale_mode)
            return web.json_response({"status": True})

    async def _notify_success(
        self,
        session,
        payment,
        activation: Optional[Dict[str, Any]],
        referral_bonus: Optional[Dict[str, Any]],
        payment_months: Any,
        sale_mode: str,
    ) -> None:
        db_user = payment.user or await user_dal.get_user_by_id(session, payment.user_id)
        lang = db_user.language_code if db_user and db_user.language_code else self.settings.DEFAULT_LANGUAGE
        _ = lambda key, **kw: self.i18n.gettext(lang, key, **kw) if self.i18n else key

        raw_config_link = activation.get("subscription_url") if activation else None
        config_link_display, connect_button_url = await prepare_config_links(self.settings, raw_config_link)
        config_link_text = config_link_display or _("config_link_not_available")

        final_end = activation.get("end_date") if activation else None
        if referral_bonus and referral_bonus.get("referee_new_end_date"):
            final_end = referral_bonus["referee_new_end_date"]

        traffic_label = str(int(payment_months)) if float(payment_months).is_integer() else f"{payment_months:g}"
        if sale_mode == "traffic":
            text = _(
                "payment_successful_traffic_full",
                traffic_gb=traffic_label,
                end_date=final_end.strftime("%Y-%m-%d") if final_end else "",
                config_link=config_link_text,
            )
        else:
            text = _(
                "payment_successful_full",
                months=payment_months,
                end_date=final_end.strftime("%Y-%m-%d") if final_end else "",
                config_link=config_link_text,
            )

        try:
            await self.bot.send_message(
                payment.user_id,
                text,
                reply_markup=get_connect_and_main_keyboard(
                    lang, self.i18n, self.settings, config_link_display,
                    connect_button_url=connect_button_url, preserve_message=True,
                ),
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
        except Exception as exc:
            logging.error("LavaPay: не удалось уведомить пользователя %s: %s", payment.user_id, exc)

        try:
            await NotificationService(self.bot, self.settings, self.i18n).notify_payment_received(
                user_id=payment.user_id,
                amount=float(payment.amount),
                currency=payment.currency,
                months=int(payment_months) if sale_mode != "traffic" else 0,
                traffic_gb=payment_months if sale_mode == "traffic" else None,
                payment_provider=PROVIDER,
                username=db_user.username if db_user else None,
            )
        except Exception as exc:
            logging.error("LavaPay: не удалось уведомить администраторов: %s", exc)


async def lavapay_webhook_route(request: web.Request) -> web.Response:
    service: LavaPayService = request.app["lavapay_service"]
    return await service.webhook_route(request)
