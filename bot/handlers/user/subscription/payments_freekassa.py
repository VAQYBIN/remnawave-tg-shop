import logging
from datetime import datetime
from typing import Optional

from aiogram import F, Router, types
from sqlalchemy.ext.asyncio import AsyncSession

from bot.keyboards.inline.user_keyboards import get_payment_url_keyboard
from bot.middlewares.i18n import JsonI18n
from bot.services.freekassa_service import FreeKassaService
from config.settings import Settings
from db.dal import payment_dal

router = Router(name="user_subscription_payments_freekassa_router")


from bot.handlers.user.subscription.payments_subscription import resolve_fiat_offer_price_for_user

@router.callback_query(F.data.startswith("pay_fk:"))
async def pay_fk_callback_handler(
    callback: types.CallbackQuery,
    settings: Settings,
    i18n_data: dict,
    freekassa_service: FreeKassaService,
    session: AsyncSession,
    promo_code_service=None,
):
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    get_text = lambda key, **kwargs: i18n.gettext(current_lang, key, **kwargs) if i18n else key

    if not i18n or not callback.message:
        try:
            await callback.answer(get_text("error_occurred_try_again"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
        return

    if not freekassa_service or not freekassa_service.configured:
        logging.error("FreeKassa service is not configured or unavailable.")
        try:
            await callback.answer(get_text("payment_service_unavailable_alert"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
        try:
            await callback.message.edit_text(get_text("payment_service_unavailable"))
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
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
            if catalog_info is None or catalog_info["price_rub"] is None:
                await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
                return
            months = float(catalog_info["months_for_legacy"])
            price_rub = catalog_info["price_rub"]
            sale_mode = catalog_info["sale_mode"]
            pricing_plan_option_id = catalog_info["option_id"]
            pricing_plan_id = catalog_info["pricing_plan_id"]
            auto_renew_bundle_snapshot = catalog_info.get("auto_renew_bundle_snapshot")
            back_callback_value = catalog_info["back_callback"]
            plan_name = catalog_info["option"].plan.name_ru if catalog_info["option"].plan else ""
            payment_description = get_text("catalog_payment_description", plan_name=plan_name)
        else:
            months = float(parts[0])
            callback_price_rub = float(parts[1])
            sale_mode = parts[2] if len(parts) > 2 else "subscription"
            resolved_price_rub = await resolve_fiat_offer_price_for_user(
                session=session, settings=settings, user_id=user_id,
                months=months, sale_mode=sale_mode, promo_code_service=promo_code_service,
            )
            if resolved_price_rub is None or abs(resolved_price_rub - callback_price_rub) > 0.01:
                await callback.answer(get_text("error_try_again"), show_alert=True)
                return
            price_rub = resolved_price_rub
            human_value = str(int(months)) if float(months).is_integer() else f"{months:g}"
            payment_description = (
                get_text("payment_description_traffic", traffic_gb=human_value)
                if sale_mode == "traffic"
                else get_text("payment_description_subscription", months=int(months))
            )
            back_callback_value = f"subscribe_period:{human_value if 'human_value' in dir() else str(int(months))}"
    except (ValueError, IndexError):
        logging.error(f"Invalid pay_fk data in callback: {callback.data}")
        try:
            await callback.answer(get_text("error_try_again"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
        return

    human_value = str(int(months)) if float(months).is_integer() else f"{months:g}"
    currency_code = getattr(freekassa_service, "default_currency", None) or "RUB"

    payment_record_payload = {
        "user_id": user_id,
        "amount": price_rub,
        "original_amount": None,
        "discount_applied": None,
        "currency": currency_code,
        "status": "pending_freekassa",
        "description": payment_description,
        "subscription_duration_months": int(months),
        "provider": "freekassa",
        "promo_code_id": None,
        "pricing_plan_option_id": pricing_plan_option_id,
        "pricing_plan_id": pricing_plan_id,
        "sale_mode": sale_mode if pricing_plan_option_id else None,
        "auto_renew_bundle_snapshot": auto_renew_bundle_snapshot,
    }

    try:
        payment_record = await payment_dal.create_payment_record(session, payment_record_payload)
        await session.commit()
    except Exception as e_db_create:
        await session.rollback()
        logging.error(
            f"FreeKassa: failed to create payment record for user {user_id}: {e_db_create}",
            exc_info=True,
        )
        try:
            await callback.message.edit_text(get_text("error_creating_payment_record"))
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
        try:
            await callback.answer(get_text("error_try_again"), show_alert=True)
        except Exception as exc:
            logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
        return

    success, response_data = await freekassa_service.create_order(
        payment_db_id=payment_record.payment_id,
        user_id=payment_record.user_id,
        months=months,
        amount=price_rub,
        currency=freekassa_service.default_currency,
        payment_method_id=freekassa_service.payment_method_id,
        ip_address=freekassa_service.server_ip,
        extra_params={
            "us_method": freekassa_service.payment_method_id,
        },
        promo_code_service=promo_code_service,
        session=session,
    )

    if success:
        location = response_data.get("location")
        order_hash = response_data.get("orderHash")
        order_id_api = response_data.get("orderId")
        provider_identifier = order_hash or order_id_api

        if provider_identifier:
            try:
                await payment_dal.update_provider_payment_and_status(
                    session,
                    payment_record.payment_id,
                    str(provider_identifier),
                    payment_record.status,
                )
                await session.commit()
            except Exception as e_status:
                await session.rollback()
                logging.error(
                    f"FreeKassa: failed to store provider order id for payment {payment_record.payment_id}: {e_status}",
                    exc_info=True,
                )

        if location:
            order_identifier_display = str(order_id_api or provider_identifier or payment_record.payment_id)
            order_info_text = get_text(
                "free_kassa_order_info",
                order_id=order_identifier_display,
                date=datetime.now().strftime("%Y-%m-%d"),
            )
            try:
                await callback.message.edit_text(
                    f"{order_info_text}\n\n" + get_text(
                        key="payment_link_message_traffic" if sale_mode == "traffic" else "payment_link_message",
                        months=int(months),
                        traffic_gb=human_value,
                    ),
                    reply_markup=get_payment_url_keyboard(
                        location,
                        current_lang,
                        i18n,
                        back_callback=back_callback_value or f"subscribe_period:{human_value}",
                        back_text_key="back_to_payment_methods_button",
                    ),
                    disable_web_page_preview=False,
                )
            except Exception as e_edit:
                logging.warning(f"FreeKassa: failed to display payment link ({e_edit}), sending new message.")
                try:
                    await callback.message.answer(
                        f"{order_info_text}\n\n" + get_text(
                            key="payment_link_message_traffic" if sale_mode == "traffic" else "payment_link_message",
                            months=int(months),
                            traffic_gb=human_value,
                        ),
                        reply_markup=get_payment_url_keyboard(
                            location,
                            current_lang,
                            i18n,
                            back_callback=back_callback_value or f"subscribe_period:{human_value}",
                            back_text_key="back_to_payment_methods_button",
                        ),
                        disable_web_page_preview=False,
                    )
                except Exception as exc:
                    logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
            try:
                await callback.answer()
            except Exception as exc:
                logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
            return

        logging.error(
            "FreeKassa: create_order succeeded but no payment link returned for payment %s. Response: %s",
            payment_record.payment_id,
            response_data,
        )
    else:
        logging.error(
            "FreeKassa: create_order failed for payment %s with response %s",
            payment_record.payment_id,
            response_data,
        )

    try:
        await payment_dal.update_payment_status_by_db_id(
            session,
            payment_record.payment_id,
            "failed_creation",
        )
        await session.commit()
    except Exception as e_status:
        await session.rollback()
        logging.error(f"FreeKassa: failed to mark payment {payment_record.payment_id} as failed_creation: {e_status}", exc_info=True)

    try:
        await callback.message.edit_text(get_text("error_payment_gateway"))
    except Exception as exc:
        logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
    try:
        await callback.answer(get_text("error_payment_gateway"), show_alert=True)
    except Exception as exc:
        logging.debug("Suppressed exception in bot/handlers/user/subscription/payments_freekassa.py: %s", exc)
