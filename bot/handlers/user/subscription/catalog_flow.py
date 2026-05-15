"""
Catalog tariff flow: plan list → plan detail + options → payment methods.
Replaces the legacy period-selector when non-legacy enabled standalone plans exist.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Union

from aiogram import F, Router, types
from sqlalchemy.ext.asyncio import AsyncSession

from bot.keyboards.inline.user_keyboards import (
    get_back_to_main_menu_markup,
    get_catalog_option_list_keyboard,
    get_catalog_tariff_list_keyboard,
    get_payment_method_keyboard,
)
from bot.middlewares.i18n import JsonI18n
from config.settings import Settings
from core.dal import plan_entitlement_dal, pricing_plan_dal
from core.services.tariff_pricing import prorate_option

router = Router(name="catalog_flow_router")

LEGACY_DEFAULT_SLUG = pricing_plan_dal.LEGACY_DEFAULT_SLUG


async def has_catalog_plans(session: AsyncSession) -> bool:
    """Return True if DB has at least one non-legacy enabled standalone plan."""
    try:
        plans = await pricing_plan_dal.get_plans(session, enabled_only=True)
        return any(
            p.plan_kind == "standalone"
            and p.slug != LEGACY_DEFAULT_SLUG
            and any(o.is_enabled for o in (p.options or []))
            for p in plans
        )
    except Exception:
        logging.exception("catalog_flow.has_catalog_plans: DB error")
        return False


async def display_catalog_tariffs(
    event: Union[types.Message, types.CallbackQuery],
    session: AsyncSession,
    i18n_data: dict,
    settings: Settings,
) -> None:
    """Show the list of available catalog tariffs."""
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    get_text = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    target = event.message if isinstance(event, types.CallbackQuery) else event

    try:
        plans = await pricing_plan_dal.get_plans(session, enabled_only=True)
    except Exception:
        logging.exception("catalog_flow.display_catalog_tariffs: failed to load plans")
        plans = []

    standalone_plans = [
        p for p in plans
        if p.plan_kind == "standalone"
        and p.slug != LEGACY_DEFAULT_SLUG
        and any(o.is_enabled for o in (p.options or []))
    ]
    addon_plans = [
        p for p in plans
        if p.plan_kind == "addon"
        and any(o.is_enabled for o in (p.options or []))
    ]

    # Check if user has active standalone (needed to show addons)
    has_standalone = False
    try:
        if addon_plans:
            user_id = event.from_user.id
            now = datetime.now(timezone.utc)
            standalone_ent = await plan_entitlement_dal.get_active_standalone_entitlement(
                session, user_id, now=now
            )
            has_standalone = bool(standalone_ent and standalone_ent.ends_at and standalone_ent.ends_at > now)
    except Exception:
        logging.exception("catalog_flow.display_catalog_tariffs: failed to check standalone")

    if not standalone_plans:
        text = get_text("no_subscription_options_available")
        markup = get_back_to_main_menu_markup(current_lang, i18n)
    else:
        text = get_text("catalog_select_tariff")
        markup = get_catalog_tariff_list_keyboard(
            standalone_plans,
            addon_plans,
            current_lang,
            i18n,
            has_standalone=has_standalone,
        )

    if isinstance(event, types.CallbackQuery):
        try:
            await target.edit_text(text, reply_markup=markup)
        except Exception:
            await target.answer(text, reply_markup=markup)
        try:
            await event.answer()
        except Exception:
            pass
    else:
        await target.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("select_tariff:"))
async def select_tariff_callback(
    callback: types.CallbackQuery,
    session: AsyncSession,
    i18n_data: dict,
    settings: Settings,
) -> None:
    """Show plan description + option buttons."""
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    get_text = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    try:
        plan_id = int(callback.data.split(":", 1)[1])
    except (ValueError, IndexError):
        await callback.answer(get_text("error_try_again"), show_alert=True)
        return

    try:
        plan = await pricing_plan_dal.get_plan_by_id(session, plan_id)
    except Exception:
        logging.exception("select_tariff_callback: DB error loading plan %s", plan_id)
        await callback.answer(get_text("error_try_again"), show_alert=True)
        return

    if not plan or not plan.is_enabled:
        await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
        return

    # Localized name / description
    name = plan.name_ru if current_lang == "ru" else (plan.name_en or plan.name_ru)
    desc = (plan.description_ru if current_lang == "ru" else (plan.description_en or plan.description_ru)) or ""

    # For addons: verify user has active standalone; compute prorated prices
    prorated_prices = None
    standalone_end_date_str = None

    if plan.plan_kind == "addon":
        user_id = callback.from_user.id
        now = datetime.now(timezone.utc)
        standalone = None
        try:
            standalone = await plan_entitlement_dal.get_active_standalone_entitlement(
                session, user_id, now=now
            )
        except Exception:
            logging.exception("select_tariff_callback: failed to load standalone for addon")

        if not standalone or not standalone.ends_at or standalone.ends_at <= now:
            await callback.answer(get_text("catalog_error_no_standalone"), show_alert=True)
            return

        standalone_end_date_str = standalone.ends_at.strftime("%Y-%m-%d")
        prorated_prices = {}
        global_min_rub = getattr(settings, "MIN_PRORATED_PRICE_RUB", None)
        global_min_stars = getattr(settings, "MIN_PRORATED_PRICE_STARS", None)
        for opt in (plan.options or []):
            if not opt.is_enabled:
                continue
            try:
                p_rub, p_stars = prorate_option(
                    price_rub=float(opt.price_rub) if opt.price_rub is not None else None,
                    price_stars=opt.price_stars,
                    duration_months=opt.duration_months,
                    duration_days=opt.duration_days,
                    plan_min_price_rub=plan.min_price_rub,
                    plan_min_price_stars=plan.min_price_stars,
                    standalone_ends_at=standalone.ends_at,
                    now=now,
                    global_min_rub=global_min_rub,
                    global_min_stars=global_min_stars,
                )
                prorated_prices[opt.id] = (p_rub, p_stars)
            except Exception:
                logging.exception("select_tariff_callback: proration failed for option %s", opt.id)
                prorated_prices[opt.id] = (
                    float(opt.price_rub) if opt.price_rub is not None else None,
                    opt.price_stars,
                )

    enabled_options = [o for o in (plan.options or []) if o.is_enabled]
    if not enabled_options:
        await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
        return

    header = f"<b>{name}</b>"
    if desc:
        header += f"\n\n{desc}"
    header += f"\n\n{get_text('catalog_select_option')}"

    markup = get_catalog_option_list_keyboard(
        plan,
        enabled_options,
        current_lang,
        i18n,
        prorated_prices=prorated_prices,
        standalone_end_date_str=standalone_end_date_str,
    )

    try:
        await callback.message.edit_text(header, reply_markup=markup, parse_mode="HTML")
    except Exception:
        await callback.message.answer(header, reply_markup=markup, parse_mode="HTML")
    try:
        await callback.answer()
    except Exception:
        pass


@router.callback_query(F.data.startswith("subscribe_option:"))
async def subscribe_option_callback(
    callback: types.CallbackQuery,
    session: AsyncSession,
    i18n_data: dict,
    settings: Settings,
    promo_code_service=None,
) -> None:
    """Resolve option price and show payment method keyboard."""
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    get_text = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    try:
        option_id = int(callback.data.split(":", 1)[1])
    except (ValueError, IndexError):
        await callback.answer(get_text("error_try_again"), show_alert=True)
        return

    try:
        opt = await pricing_plan_dal.get_plan_option_by_id(session, option_id)
    except Exception:
        logging.exception("subscribe_option_callback: DB error loading option %s", option_id)
        await callback.answer(get_text("error_try_again"), show_alert=True)
        return

    if not opt or not opt.is_enabled or not opt.plan or not opt.plan.is_enabled:
        await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
        return

    plan = opt.plan
    plan_kind = plan.plan_kind  # "standalone" or "addon"
    now = datetime.now(timezone.utc)

    price_rub: Optional[float] = None
    price_stars: Optional[int] = None

    if plan_kind == "addon":
        user_id = callback.from_user.id
        standalone = None
        try:
            standalone = await plan_entitlement_dal.get_active_standalone_entitlement(
                session, user_id, now=now
            )
        except Exception:
            logging.exception("subscribe_option_callback: failed to load standalone")

        if not standalone or not standalone.ends_at or standalone.ends_at <= now:
            await callback.answer(get_text("catalog_error_no_standalone"), show_alert=True)
            return

        global_min_rub = getattr(settings, "MIN_PRORATED_PRICE_RUB", None)
        global_min_stars = getattr(settings, "MIN_PRORATED_PRICE_STARS", None)
        price_rub, price_stars = prorate_option(
            price_rub=float(opt.price_rub) if opt.price_rub is not None else None,
            price_stars=opt.price_stars,
            duration_months=opt.duration_months,
            duration_days=opt.duration_days,
            plan_min_price_rub=plan.min_price_rub,
            plan_min_price_stars=plan.min_price_stars,
            standalone_ends_at=standalone.ends_at,
            now=now,
            global_min_rub=global_min_rub,
            global_min_stars=global_min_stars,
        )
    else:
        price_rub = float(opt.price_rub) if opt.price_rub is not None else None
        price_stars = opt.price_stars

    # Determine display price and currency symbol for the message
    if price_rub is not None:
        display_price = price_rub
        currency_symbol = "RUB"
    elif price_stars is not None:
        display_price = float(price_stars)
        currency_symbol = "⭐"
    else:
        await callback.answer(get_text("catalog_error_option_not_found"), show_alert=True)
        return

    # Encode catalog option in callback value as "o{option_id}"
    catalog_value = f"o{option_id}"

    markup = get_payment_method_keyboard(
        catalog_value,
        display_price,
        price_stars,
        currency_symbol,
        current_lang,
        i18n,
        settings,
        sale_mode=plan_kind,
    )

    text = get_text("choose_payment_method")
    try:
        await callback.message.edit_text(text, reply_markup=markup)
    except Exception:
        await callback.message.answer(text, reply_markup=markup)
    try:
        await callback.answer()
    except Exception:
        pass
