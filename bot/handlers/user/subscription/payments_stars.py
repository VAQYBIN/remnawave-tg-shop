import logging
from typing import Optional

from aiogram import F, Router, types
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy.ext.asyncio import AsyncSession

from bot.middlewares.i18n import JsonI18n
from bot.services.stars_service import StarsService
from config.settings import Settings

router = Router(name="user_subscription_payments_stars_router")


@router.callback_query(F.data.startswith("pay_stars:"))
async def pay_stars_callback_handler(
    callback: types.CallbackQuery,
    settings: Settings,
    i18n_data: dict,
    session: AsyncSession,
    stars_service: StarsService,
    promo_code_service=None,
):
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    get_text = (lambda key, **kwargs: i18n.gettext(current_lang, key, **kwargs) if i18n else key)

    if not i18n or not callback.message:
        try:
            await callback.answer(get_text("error_occurred_try_again"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_stars.py: %s", exc)
        return

    if not settings.STARS_ENABLED:
        try:
            await callback.answer(get_text("payment_service_unavailable_alert"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_stars.py: %s", exc)
        return

    user_id = callback.from_user.id
    pricing_plan_option_id = None
    pricing_plan_id = None
    back_callback_value = None
    auto_renew_bundle_snapshot = None

    try:
        _, data_payload = callback.data.split(":", 1)
        parts = data_payload.split(":")

        if parts[0].startswith("o") and parts[0][1:].isdigit():
            from bot.handlers.user.subscription.payments_subscription import resolve_catalog_offer_for_payment
            catalog_info = await resolve_catalog_offer_for_payment(session, parts, user_id, settings)
            if catalog_info is None or catalog_info["price_stars"] is None:
                await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
                return
            months = float(catalog_info["months_for_legacy"])
            stars_price = int(catalog_info["price_stars"])
            sale_mode = catalog_info["sale_mode"]
            pricing_plan_option_id = catalog_info["option_id"]
            pricing_plan_id = catalog_info["pricing_plan_id"]
            auto_renew_bundle_snapshot = catalog_info.get("auto_renew_bundle_snapshot")
            back_callback_value = catalog_info["back_callback"]
            plan_name = catalog_info["option"].plan.name_ru if catalog_info["option"].plan else ""
            payment_description = get_text("catalog_payment_description", plan_name=plan_name)
        else:
            months = float(parts[0])
            stars_price = int(float(parts[1]))
            sale_mode = parts[2] if len(parts) > 2 else "subscription"
            human_value = str(int(months)) if float(months).is_integer() else f"{months:g}"
            payment_description = (
                get_text("payment_description_traffic", traffic_gb=human_value)
                if sale_mode == "traffic"
                else get_text("payment_description_subscription", months=int(months))
            )
            back_callback_value = f"subscribe_period:{human_value}"
    except (ValueError, IndexError):
        try:
            await callback.answer(get_text("error_try_again"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_stars.py: %s", exc)
        return

    human_value = str(int(months)) if float(months).is_integer() else f"{months:g}"

    payment_db_id = await stars_service.create_invoice(
        session=session,
        user_id=user_id,
        months=months,
        stars_price=stars_price,
        description=payment_description,
        sale_mode=sale_mode,
        promo_code_service=promo_code_service,
        pricing_plan_option_id=pricing_plan_option_id,
        pricing_plan_id=pricing_plan_id,
        auto_renew_bundle_snapshot=auto_renew_bundle_snapshot,
    )

    if payment_db_id:
        try:
            await callback.message.edit_text(
                get_text(
                    "payment_invoice_sent_message_traffic" if sale_mode == "traffic" else "payment_invoice_sent_message",
                    months=int(months),
                    traffic_gb=human_value,
                ),
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text=get_text("back_to_payment_methods_button"),
                                callback_data=back_callback_value or f"subscribe_period:{human_value}",
                            )
                        ],
                        [
                            InlineKeyboardButton(
                                text=get_text("cancel_button"),
                                callback_data="main_action:subscribe",
                            )
                        ],
                    ]
                ),
            )
        except Exception as e_edit:
            logging.warning(f"Stars payment: failed to show invoice info message ({e_edit})")
        try:
            await callback.answer()
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_stars.py: %s", exc)
        return

    try:
        await callback.answer(get_text("error_payment_gateway"), show_alert=True)
    except Exception as exc:
        logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_stars.py: %s", exc)


@router.pre_checkout_query()
async def handle_pre_checkout_query(query: types.PreCheckoutQuery):
    try:
        await query.answer(ok=True)
    except Exception as exc:
        # Nothing else to do here; Telegram will show an error if not answered
        logging.debug("Failed to answer pre_checkout_query in payments_stars: %s", exc)


@router.message(F.successful_payment)
async def handle_successful_stars_payment(
    message: types.Message,
    settings: Settings,
    i18n_data: dict,
    session: AsyncSession,
    stars_service: StarsService,
):
    payload = (message.successful_payment.invoice_payload
               if message and message.successful_payment else "")
    try:
        parts = (payload or "").split(":")
        payment_db_id = int(parts[0])
        months = float(parts[1]) if len(parts) > 1 else 0
        sale_mode = parts[2] if len(parts) > 2 else "subscription"
    except Exception:
        return

    stars_amount = int(message.successful_payment.total_amount) if message.successful_payment else 0
    await stars_service.process_successful_payment(
        session=session,
        message=message,
        payment_db_id=payment_db_id,
        months=months,
        stars_amount=stars_amount,
        i18n_data=i18n_data,
        sale_mode=sale_mode,
    )
