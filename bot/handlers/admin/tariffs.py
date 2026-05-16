"""Admin tariff management — Phase 7.

Provides:
  - Tariff list with enable/disable/delete
  - FSM-based tariff creation (name → squad → kind → billing → strategy → trial → options → confirm)
"""
import json
import logging
import re
from typing import Optional, Any

from aiogram import Router, F, types
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.utils.keyboard import InlineKeyboardBuilder, InlineKeyboardButton
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from bot.middlewares.i18n import JsonI18n
from bot.states.admin_states import AdminStates
from config.settings import Settings
from core.dal import pricing_plan_dal
from core.services.panel_client import PanelApiService
from db.models import UserPlanEntitlement

logger = logging.getLogger(__name__)

router = Router(name="admin_tariffs_router")

# ── i18n helpers ────────────────────────────────────────────────────────────

def _get_i18n(i18n_data: dict, settings: Settings):
    lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    return lang, i18n


def _mk(i18n, lang):
    return lambda key, **kw: i18n.gettext(lang, key, **kw)


# ── Formatting helpers ───────────────────────────────────────────────────────

def _fmt_kind(kind: str) -> str:
    return {"standalone": "основной", "addon": "добавочный"}.get(kind, kind)


def _fmt_billing(billing: str) -> str:
    return {"time": "по времени", "traffic": "по трафику", "hybrid": "гибридный"}.get(billing, billing)


def _fmt_strategy(strategy: str) -> str:
    return {
        "NO_RESET": "NO_RESET",
        "DAY": "DAY",
        "WEEK": "WEEK",
        "MONTH": "MONTH",
        "MONTH_ROLLING": "MONTH_ROLLING",
    }.get(strategy, strategy)


def _fmt_prices_rub(options) -> str:
    prices = [str(int(o.price_rub)) for o in options if o.price_rub is not None]
    return " / ".join(prices) if prices else "—"


def _fmt_prices_stars(options) -> str:
    prices = [str(o.price_stars) for o in options if o.price_stars is not None]
    return " / ".join(prices) if prices else "—"


def _fmt_option_summary(opt: dict, n: int) -> str:
    parts = [f"Опция {n}:"]
    if opt.get("duration_months"):
        parts.append(f"  ⏱ {opt['duration_months']} мес.")
    elif opt.get("duration_days"):
        parts.append(f"  ⏱ {opt['duration_days']} дн.")
    if opt.get("traffic_unlimited"):
        parts.append("  📦 Unlimited")
    elif opt.get("traffic_gb") is not None:
        parts.append(f"  📦 {opt['traffic_gb']} ГБ")
    if opt.get("price_rub") is not None:
        parts.append(f"  💰 {opt['price_rub']} ₽")
    if opt.get("price_stars") is not None:
        parts.append(f"  ⭐ {opt['price_stars']} Stars")
    return "\n".join(parts)


def _build_creation_summary(data: dict) -> str:
    lines = [
        f"<b>{data.get('name_ru', '—')}</b>",
        f"Тип: {_fmt_kind(data.get('plan_kind', '—'))}",
        f"Биллинг: {_fmt_billing(data.get('billing_model', '—'))}",
        f"Стратегия: {_fmt_strategy(data.get('traffic_reset_strategy', '—'))}",
        f"Squad: {data.get('squad_name', data.get('squad_uuid', '—'))}",
    ]
    if data.get("is_trial"):
        lines.append("🎁 Trial-тариф")
    if data.get("name_en"):
        lines.append(f"EN: {data['name_en']}")
    if data.get("desc_ru"):
        lines.append(f"Описание RU: {data['desc_ru'][:80]}")
    options: list = data.get("options", [])
    if options:
        lines.append(f"\nОпции ({len(options)}):")
        for i, opt in enumerate(options, 1):
            lines.append(_fmt_option_summary(opt, i))
    return "\n".join(lines)


# ── Squads cache ─────────────────────────────────────────────────────────────

async def _fetch_squads(settings: Settings) -> Optional[list]:
    """Fetch squads from Remnawave. Returns list or None if unavailable."""
    panel = PanelApiService(settings)
    squads = await panel.get_internal_squads()
    return squads


# ── Keyboards ────────────────────────────────────────────────────────────────

def _tariff_list_kb(i18n, lang: str, plans: list) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    for plan in plans:
        status = "✅" if plan.is_enabled else "⛔"
        kind_label = _fmt_kind(plan.plan_kind)
        label = f"{status} {plan.name_ru} ({kind_label})"
        builder.row(InlineKeyboardButton(text=label, callback_data=f"admin_tariff:card:{plan.id}"))
    builder.row(InlineKeyboardButton(text=_("admin_tariff_create_button"), callback_data="admin_tariff:create"))
    builder.row(InlineKeyboardButton(text=_("back_to_admin_panel_button"), callback_data="admin_action:main"))
    return builder.as_markup()


def _tariff_card_kb(i18n, lang: str, plan) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    if plan.is_enabled:
        builder.row(InlineKeyboardButton(text=_("admin_tariff_disable_button"), callback_data=f"admin_tariff:disable:{plan.id}"))
    else:
        builder.row(InlineKeyboardButton(text=_("admin_tariff_enable_button"), callback_data=f"admin_tariff:enable:{plan.id}"))
    builder.row(InlineKeyboardButton(text=_("admin_tariff_delete_button"), callback_data=f"admin_tariff:delete:{plan.id}"))
    builder.row(InlineKeyboardButton(text=_("back_to_tariff_list_button"), callback_data="admin_tariff:list"))
    return builder.as_markup()


def _delete_confirm_kb(i18n, lang: str, plan_id: int) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_delete_confirm_yes"), callback_data=f"admin_tariff:delete_confirm:{plan_id}"),
        InlineKeyboardButton(text=_("admin_tariff_delete_confirm_no"), callback_data=f"admin_tariff:card:{plan_id}"),
    )
    return builder.as_markup()


def _skip_cancel_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_skip_button"), callback_data="admin_tariff:skip"),
        InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"),
    )
    return builder.as_markup()


def _cancel_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _squads_kb(i18n, lang: str, squads: list) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    for squad in squads:
        uuid = squad.get("uuid") or squad.get("id") or ""
        name = squad.get("name") or squad.get("squadName") or uuid
        if not uuid:
            continue
        # Trim callback to fit 64-byte limit: prefix 21 + uuid 36 = 57 bytes — OK
        builder.row(InlineKeyboardButton(text=name, callback_data=f"admin_tariff:squad:{uuid}"))
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _kind_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_kind_standalone"), callback_data="admin_tariff:kind:standalone"),
        InlineKeyboardButton(text=_("admin_tariff_kind_addon"), callback_data="admin_tariff:kind:addon"),
    )
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _billing_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_billing_time"), callback_data="admin_tariff:billing:time"),
        InlineKeyboardButton(text=_("admin_tariff_billing_traffic"), callback_data="admin_tariff:billing:traffic"),
    )
    builder.row(InlineKeyboardButton(text=_("admin_tariff_billing_hybrid"), callback_data="admin_tariff:billing:hybrid"))
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _strategy_kb(i18n, lang: str, billing_model: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    # time → only NO_RESET
    if billing_model == "time":
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_no_reset"), callback_data="admin_tariff:strategy:NO_RESET"))
    else:
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_no_reset"), callback_data="admin_tariff:strategy:NO_RESET"))
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_day"), callback_data="admin_tariff:strategy:DAY"))
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_week"), callback_data="admin_tariff:strategy:WEEK"))
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_month"), callback_data="admin_tariff:strategy:MONTH"))
        builder.row(InlineKeyboardButton(text=_("admin_tariff_strategy_month_rolling"), callback_data="admin_tariff:strategy:MONTH_ROLLING"))
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _is_trial_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_yes_button"), callback_data="admin_tariff:is_trial:yes"),
        InlineKeyboardButton(text=_("admin_tariff_no_button"), callback_data="admin_tariff:is_trial:no"),
    )
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _opt_traffic_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_option_unlimited"), callback_data="admin_tariff:opt_unlimited"),
        InlineKeyboardButton(text=_("admin_tariff_option_enter_gb"), callback_data="admin_tariff:opt_enter_gb"),
    )
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _opt_more_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_option_add_more"), callback_data="admin_tariff:opt_more"),
        InlineKeyboardButton(text=_("admin_tariff_option_done"), callback_data="admin_tariff:opt_done"),
    )
    builder.row(InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"))
    return builder.as_markup()


def _confirm_kb(i18n, lang: str) -> types.InlineKeyboardMarkup:
    _ = _mk(i18n, lang)
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text=_("admin_tariff_confirm_button"), callback_data="admin_tariff:confirm"),
        InlineKeyboardButton(text=_("admin_tariff_cancel_button"), callback_data="admin_tariff:cancel"),
    )
    return builder.as_markup()


# ── FSM helpers ──────────────────────────────────────────────────────────────

async def _edit_or_answer(message: types.Message, text: str, reply_markup=None):
    try:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode="HTML")
    except Exception:
        await message.answer(text, reply_markup=reply_markup, parse_mode="HTML")


async def _send_step(callback: types.CallbackQuery, text: str, markup, state, new_state):
    if callback.message:
        await _edit_or_answer(callback.message, text, markup)
    await callback.answer()
    await state.set_state(new_state)


# ── Tariff list ──────────────────────────────────────────────────────────────

async def show_tariff_list(callback: types.CallbackQuery, i18n_data: dict,
                           settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    plans = await pricing_plan_dal.get_plans(session)
    count = len(plans)
    if count == 0:
        text = _("admin_tariffs_empty")
    else:
        text = _("admin_tariffs_list_header", count=count)
    await _edit_or_answer(callback.message, text, _tariff_list_kb(i18n, lang, plans))
    await callback.answer()


@router.callback_query(F.data == "admin_tariff:list")
async def tariff_list_handler(callback: types.CallbackQuery, i18n_data: dict,
                               settings: Settings, session: AsyncSession):
    await show_tariff_list(callback, i18n_data, settings, session)


@router.callback_query(F.data.startswith("admin_tariff:card:"))
async def tariff_card_handler(callback: types.CallbackQuery, i18n_data: dict,
                               settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    try:
        plan_id = int(callback.data.split(":")[2])
    except (IndexError, ValueError):
        await callback.answer("Bad plan ID.", show_alert=True)
        return

    plan = await pricing_plan_dal.get_plan_by_id(session, plan_id)
    if not plan:
        await callback.answer(_("admin_tariff_not_found"), show_alert=True)
        return

    status = _("admin_tariff_enabled") if plan.is_enabled else _("admin_tariff_disabled")
    squad_name = plan.remnawave_squad_name_snapshot or plan.remnawave_squad_uuid or "—"
    prices_rub = _fmt_prices_rub(plan.options)
    prices_stars = _fmt_prices_stars(plan.options)
    trial_label = " 🎁 Trial" if plan.is_trial else ""

    text = _("admin_tariff_card",
             name=plan.name_ru + trial_label,
             kind=_fmt_kind(plan.plan_kind),
             billing=_fmt_billing(plan.billing_model),
             squad=squad_name,
             options_count=len(plan.options),
             prices_rub=prices_rub,
             prices_stars=prices_stars,
             status=status)
    await _edit_or_answer(callback.message, text, _tariff_card_kb(i18n, lang, plan))
    await callback.answer()


@router.callback_query(F.data.startswith("admin_tariff:enable:") | F.data.startswith("admin_tariff:disable:"))
async def tariff_toggle_handler(callback: types.CallbackQuery, i18n_data: dict,
                                settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    parts = callback.data.split(":")
    action = parts[1]
    try:
        plan_id = int(parts[2])
    except (IndexError, ValueError):
        await callback.answer("Bad plan ID.", show_alert=True)
        return

    plan = await pricing_plan_dal.get_plan_by_id(session, plan_id)
    if not plan:
        await callback.answer(_("admin_tariff_not_found"), show_alert=True)
        return

    new_enabled = action == "enable"
    await pricing_plan_dal.update_plan(session, plan_id, is_enabled=new_enabled)
    await session.commit()
    await callback.answer(_("admin_tariff_toggle_success"))

    # Refresh card
    plan = await pricing_plan_dal.get_plan_by_id(session, plan_id)
    status = _("admin_tariff_enabled") if plan.is_enabled else _("admin_tariff_disabled")
    squad_name = plan.remnawave_squad_name_snapshot or plan.remnawave_squad_uuid or "—"
    prices_rub = _fmt_prices_rub(plan.options)
    prices_stars = _fmt_prices_stars(plan.options)
    trial_label = " 🎁 Trial" if plan.is_trial else ""
    text = _("admin_tariff_card",
             name=plan.name_ru + trial_label,
             kind=_fmt_kind(plan.plan_kind),
             billing=_fmt_billing(plan.billing_model),
             squad=squad_name,
             options_count=len(plan.options),
             prices_rub=prices_rub,
             prices_stars=prices_stars,
             status=status)
    await _edit_or_answer(callback.message, text, _tariff_card_kb(i18n, lang, plan))


@router.callback_query(F.data.startswith("admin_tariff:delete:") & ~F.data.startswith("admin_tariff:delete_confirm:"))
async def tariff_delete_prompt_handler(callback: types.CallbackQuery, state: FSMContext,
                                       i18n_data: dict, settings: Settings,
                                       session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    try:
        plan_id = int(callback.data.split(":")[2])
    except (IndexError, ValueError):
        await callback.answer("Bad plan ID.", show_alert=True)
        return

    plan = await pricing_plan_dal.get_plan_by_id(session, plan_id)
    if not plan:
        await callback.answer(_("admin_tariff_not_found"), show_alert=True)
        return

    text = _("admin_tariff_delete_confirm_text", name=plan.name_ru)
    await _edit_or_answer(callback.message, text, _delete_confirm_kb(i18n, lang, plan_id))
    await callback.answer()


@router.callback_query(F.data.startswith("admin_tariff:delete_confirm:"))
async def tariff_delete_confirm_handler(callback: types.CallbackQuery, i18n_data: dict,
                                        settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    try:
        plan_id = int(callback.data.split(":")[2])
    except (IndexError, ValueError):
        await callback.answer("Bad plan ID.", show_alert=True)
        return

    # Check active entitlements
    result = await session.execute(
        select(func.count(UserPlanEntitlement.id)).where(
            UserPlanEntitlement.plan_id == plan_id,
            UserPlanEntitlement.is_active == True,
        )
    )
    active_count = result.scalar_one()
    if active_count > 0:
        await callback.answer(_("admin_tariff_delete_failed"), show_alert=True)
        return

    deleted = await pricing_plan_dal.delete_plan(session, plan_id)
    await session.commit()

    if deleted:
        await callback.answer(_("admin_tariff_deleted"))
        plans = await pricing_plan_dal.get_plans(session)
        count = len(plans)
        text = _("admin_tariffs_list_header", count=count) if count else _("admin_tariffs_empty")
        await _edit_or_answer(callback.message, text, _tariff_list_kb(i18n, lang, plans))
    else:
        await callback.answer(_("admin_tariff_not_found"), show_alert=True)


# ── FSM: Cancel ──────────────────────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:cancel")
async def tariff_fsm_cancel(callback: types.CallbackQuery, state: FSMContext,
                             i18n_data: dict, settings: Settings, session: AsyncSession):
    await state.clear()
    await show_tariff_list(callback, i18n_data, settings, session)


# ── FSM: Create — Step 1: name_ru ────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:create")
async def tariff_create_start(callback: types.CallbackQuery, state: FSMContext,
                               i18n_data: dict, settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    await state.clear()
    await state.update_data(options=[])
    await _send_step(callback, _("admin_tariff_step_name_ru"), _cancel_kb(i18n, lang),
                     state, AdminStates.tariff_step_name_ru)


@router.message(StateFilter(AdminStates.tariff_step_name_ru))
async def tariff_step_name_ru(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n:
        return
    _ = _mk(i18n, lang)

    name_ru = message.text.strip() if message.text else ""
    if not name_ru:
        await message.answer(_("admin_tariff_step_name_ru"), reply_markup=_cancel_kb(i18n, lang), parse_mode="HTML")
        return
    await state.update_data(name_ru=name_ru)
    await message.answer(_("admin_tariff_step_name_en"), reply_markup=_skip_cancel_kb(i18n, lang), parse_mode="HTML")
    await state.set_state(AdminStates.tariff_step_name_en)


# ── FSM: Step 2: name_en ────────────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:skip", StateFilter(AdminStates.tariff_step_name_en))
async def tariff_skip_name_en(callback: types.CallbackQuery, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    await state.update_data(name_en=None)
    await _send_step(callback, _("admin_tariff_step_desc_ru"), _skip_cancel_kb(i18n, lang),
                     state, AdminStates.tariff_step_desc_ru)


@router.message(StateFilter(AdminStates.tariff_step_name_en))
async def tariff_step_name_en(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    name_en = (message.text or "").strip() or None
    await state.update_data(name_en=name_en)
    await message.answer(_("admin_tariff_step_desc_ru"), reply_markup=_skip_cancel_kb(i18n, lang), parse_mode="HTML")
    await state.set_state(AdminStates.tariff_step_desc_ru)


# ── FSM: Step 3: desc_ru ────────────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:skip", StateFilter(AdminStates.tariff_step_desc_ru))
async def tariff_skip_desc_ru(callback: types.CallbackQuery, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    await state.update_data(desc_ru=None)
    await _send_step(callback, _("admin_tariff_step_desc_en"), _skip_cancel_kb(i18n, lang),
                     state, AdminStates.tariff_step_desc_en)


@router.message(StateFilter(AdminStates.tariff_step_desc_ru))
async def tariff_step_desc_ru(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    desc_ru = (message.text or "").strip() or None
    await state.update_data(desc_ru=desc_ru)
    await message.answer(_("admin_tariff_step_desc_en"), reply_markup=_skip_cancel_kb(i18n, lang), parse_mode="HTML")
    await state.set_state(AdminStates.tariff_step_desc_en)


# ── FSM: Step 4: desc_en ────────────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:skip", StateFilter(AdminStates.tariff_step_desc_en))
async def tariff_skip_desc_en(callback: types.CallbackQuery, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    await state.update_data(desc_en=None)
    await _go_to_squad_step(callback, state, i18n, lang, settings)


@router.message(StateFilter(AdminStates.tariff_step_desc_en))
async def tariff_step_desc_en(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    desc_en = (message.text or "").strip() or None
    await state.update_data(desc_en=desc_en)

    # Build a fake callback-like response to reuse _go_to_squad_step
    class _FakeCallback:
        def __init__(self, msg):
            self.message = msg
        async def answer(self, *a, **kw):
            pass

    await _go_to_squad_step(_FakeCallback(message), state, i18n, lang, settings, send_new=True)


async def _go_to_squad_step(callback_like: Any, state: FSMContext, i18n, lang: str,
                             settings: Settings, send_new: bool = False):
    _ = _mk(i18n, lang)
    await callback_like.answer()

    squads = await _fetch_squads(settings)
    if squads is None:
        text = _("admin_tariff_squad_unavailable")
        await state.clear()
        if hasattr(callback_like.message, "edit_text") and not send_new:
            await _edit_or_answer(callback_like.message, text, None)
        else:
            await callback_like.message.answer(text, parse_mode="HTML")
        return

    await state.update_data(squads_cache=squads)
    text = _("admin_tariff_step_squad")
    kb = _squads_kb(i18n, lang, squads)
    if send_new:
        await callback_like.message.answer(text, reply_markup=kb, parse_mode="HTML")
    else:
        await _edit_or_answer(callback_like.message, text, kb)
    await state.set_state(AdminStates.tariff_step_squad)


# ── FSM: Step 5: squad ──────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin_tariff:squad:"), StateFilter(AdminStates.tariff_step_squad))
async def tariff_step_squad(callback: types.CallbackQuery, state: FSMContext,
                             i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    squad_uuid = callback.data[len("admin_tariff:squad:"):]
    fsm_data = await state.get_data()
    squads: list = fsm_data.get("squads_cache", [])
    squad_name = squad_uuid
    for sq in squads:
        if (sq.get("uuid") or sq.get("id")) == squad_uuid:
            squad_name = sq.get("name") or sq.get("squadName") or squad_uuid
            break

    await state.update_data(squad_uuid=squad_uuid, squad_name=squad_name)
    await _send_step(callback, _("admin_tariff_step_kind"), _kind_kb(i18n, lang),
                     state, AdminStates.tariff_step_kind)


# ── FSM: Step 6: kind ───────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin_tariff:kind:"), StateFilter(AdminStates.tariff_step_kind))
async def tariff_step_kind(callback: types.CallbackQuery, state: FSMContext,
                            i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    kind = callback.data.split(":")[2]
    if kind not in ("standalone", "addon"):
        await callback.answer("Invalid kind.", show_alert=True)
        return
    await state.update_data(plan_kind=kind)
    await _send_step(callback, _("admin_tariff_step_billing"), _billing_kb(i18n, lang),
                     state, AdminStates.tariff_step_billing)


# ── FSM: Step 7: billing_model ──────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin_tariff:billing:"), StateFilter(AdminStates.tariff_step_billing))
async def tariff_step_billing(callback: types.CallbackQuery, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    billing = callback.data.split(":")[2]
    if billing not in ("time", "traffic", "hybrid"):
        await callback.answer("Invalid billing.", show_alert=True)
        return
    await state.update_data(billing_model=billing)
    await _send_step(callback, _("admin_tariff_step_strategy"), _strategy_kb(i18n, lang, billing),
                     state, AdminStates.tariff_step_strategy)


# ── FSM: Step 8: traffic_reset_strategy ─────────────────────────────────────

@router.callback_query(F.data.startswith("admin_tariff:strategy:"), StateFilter(AdminStates.tariff_step_strategy))
async def tariff_step_strategy(callback: types.CallbackQuery, state: FSMContext,
                                i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    strategy = callback.data.split(":")[2]
    valid_strategies = {"NO_RESET", "DAY", "WEEK", "MONTH", "MONTH_ROLLING"}
    if strategy not in valid_strategies:
        await callback.answer("Invalid strategy.", show_alert=True)
        return

    fsm_data = await state.get_data()
    billing = fsm_data.get("billing_model", "time")
    if billing == "time" and strategy != "NO_RESET":
        await callback.answer("Для time-биллинга допустим только NO_RESET.", show_alert=True)
        return

    await state.update_data(traffic_reset_strategy=strategy)

    # Skip is_trial step for addon kind
    plan_kind = fsm_data.get("plan_kind", "standalone")
    if plan_kind == "addon":
        await state.update_data(is_trial=False)
        await _go_to_option_step(callback, state, i18n, lang)
    else:
        await _send_step(callback, _("admin_tariff_step_is_trial"), _is_trial_kb(i18n, lang),
                         state, AdminStates.tariff_step_is_trial)


# ── FSM: Step 9: is_trial ───────────────────────────────────────────────────

@router.callback_query(F.data.startswith("admin_tariff:is_trial:"), StateFilter(AdminStates.tariff_step_is_trial))
async def tariff_step_is_trial(callback: types.CallbackQuery, state: FSMContext,
                                i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    is_trial = callback.data.split(":")[2] == "yes"
    await state.update_data(is_trial=is_trial)
    await _go_to_option_step(callback, state, i18n, lang)


async def _go_to_option_step(callback: types.CallbackQuery, state: FSMContext, i18n, lang: str):
    _ = _mk(i18n, lang)
    fsm_data = await state.get_data()
    options: list = fsm_data.get("options", [])
    n = len(options) + 1
    billing = fsm_data.get("billing_model", "time")

    if billing == "traffic":
        # No duration for traffic-only plans — go straight to traffic
        await state.update_data(current_option={})
        await _send_step(callback, _("admin_tariff_step_opt_traffic_gb", n=n),
                         _cancel_kb(i18n, lang), state, AdminStates.tariff_step_opt_gb_input)
    else:
        # Ask for duration
        await state.update_data(current_option={})
        await _send_step(callback, _("admin_tariff_step_opt_duration", n=n),
                         _cancel_kb(i18n, lang), state, AdminStates.tariff_step_opt_duration)


# ── FSM: Option — duration ───────────────────────────────────────────────────

@router.message(StateFilter(AdminStates.tariff_step_opt_duration))
async def tariff_opt_duration(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    text = (message.text or "").strip()
    duration_months = None
    duration_days = None

    # Parse "d30" as days, otherwise as months
    m = re.fullmatch(r"d(\d+)", text, re.IGNORECASE)
    if m:
        duration_days = int(m.group(1))
    else:
        try:
            duration_months = int(text)
        except ValueError:
            await message.answer(_("admin_tariff_opt_duration_invalid"), parse_mode="HTML")
            return

    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["duration_months"] = duration_months
    current_option["duration_days"] = duration_days
    await state.update_data(current_option=current_option)

    billing = fsm_data.get("billing_model", "time")
    options: list = fsm_data.get("options", [])
    n = len(options) + 1

    if billing == "time":
        # Ask traffic: unlimited or GB
        await message.answer(_("admin_tariff_step_opt_traffic", n=n),
                             reply_markup=_opt_traffic_kb(i18n, lang), parse_mode="HTML")
        await state.set_state(AdminStates.tariff_step_opt_traffic)
    else:
        # hybrid: GB required
        await message.answer(_("admin_tariff_step_opt_traffic_gb", n=n),
                             reply_markup=_cancel_kb(i18n, lang), parse_mode="HTML")
        await state.set_state(AdminStates.tariff_step_opt_gb_input)


# ── FSM: Option — traffic (unlimited or GB) ─────────────────────────────────

@router.callback_query(F.data == "admin_tariff:opt_unlimited", StateFilter(AdminStates.tariff_step_opt_traffic))
async def tariff_opt_unlimited(callback: types.CallbackQuery, state: FSMContext,
                                i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["traffic_unlimited"] = True
    current_option["traffic_gb"] = None
    await state.update_data(current_option=current_option)

    options: list = fsm_data.get("options", [])
    n = len(options) + 1
    is_trial = fsm_data.get("is_trial", False)
    if is_trial:
        # Trial: price_rub fixed at 0
        current_option["price_rub"] = 0
        current_option["price_stars"] = None
        await state.update_data(current_option=current_option)
        await _finalize_option(callback, state, i18n, lang)
    else:
        await _send_step(callback, _("admin_tariff_step_opt_price_rub", n=n),
                         _cancel_kb(i18n, lang), state, AdminStates.tariff_step_opt_price_rub)


@router.callback_query(F.data == "admin_tariff:opt_enter_gb", StateFilter(AdminStates.tariff_step_opt_traffic))
async def tariff_opt_enter_gb_prompt(callback: types.CallbackQuery, state: FSMContext,
                                     i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)
    fsm_data = await state.get_data()
    options: list = fsm_data.get("options", [])
    n = len(options) + 1
    await _send_step(callback, _("admin_tariff_step_opt_traffic_gb", n=n),
                     _cancel_kb(i18n, lang), state, AdminStates.tariff_step_opt_gb_input)


# ── FSM: Option — GB input ───────────────────────────────────────────────────

@router.message(StateFilter(AdminStates.tariff_step_opt_gb_input))
async def tariff_opt_gb_input(message: types.Message, state: FSMContext,
                               i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    text = (message.text or "").strip()
    try:
        traffic_gb = float(text)
    except ValueError:
        await message.answer(_("admin_tariff_opt_traffic_invalid"), parse_mode="HTML")
        return

    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["traffic_gb"] = traffic_gb
    current_option["traffic_unlimited"] = False
    await state.update_data(current_option=current_option)

    options: list = fsm_data.get("options", [])
    n = len(options) + 1
    is_trial = fsm_data.get("is_trial", False)
    if is_trial:
        current_option["price_rub"] = 0
        current_option["price_stars"] = None
        await state.update_data(current_option=current_option)

        class _FakeCallback:
            def __init__(self, msg):
                self.message = msg
            async def answer(self, *a, **kw):
                pass

        await _finalize_option(_FakeCallback(message), state, i18n, lang)
    else:
        await message.answer(_("admin_tariff_step_opt_price_rub", n=n),
                             reply_markup=_cancel_kb(i18n, lang), parse_mode="HTML")
        await state.set_state(AdminStates.tariff_step_opt_price_rub)


# ── FSM: Option — price_rub ─────────────────────────────────────────────────

@router.message(StateFilter(AdminStates.tariff_step_opt_price_rub))
async def tariff_opt_price_rub(message: types.Message, state: FSMContext,
                                i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    text = (message.text or "").strip().lower()
    if text in ("пропустить", "skip", "-"):
        price_rub = None
    else:
        try:
            price_rub = float(text)
        except ValueError:
            await message.answer(_("admin_tariff_opt_price_invalid"), parse_mode="HTML")
            return

    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["price_rub"] = price_rub
    await state.update_data(current_option=current_option)

    options: list = fsm_data.get("options", [])
    n = len(options) + 1
    await message.answer(_("admin_tariff_step_opt_price_stars", n=n),
                         reply_markup=_skip_cancel_kb(i18n, lang), parse_mode="HTML")
    await state.set_state(AdminStates.tariff_step_opt_price_stars)


# ── FSM: Option — price_stars ───────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:skip", StateFilter(AdminStates.tariff_step_opt_price_stars))
async def tariff_skip_price_stars(callback: types.CallbackQuery, state: FSMContext,
                                   i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["price_stars"] = None
    await state.update_data(current_option=current_option)
    await _finalize_option(callback, state, i18n, lang)


@router.message(StateFilter(AdminStates.tariff_step_opt_price_stars))
async def tariff_opt_price_stars(message: types.Message, state: FSMContext,
                                  i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    text = (message.text or "").strip().lower()
    if text in ("пропустить", "skip", "-"):
        price_stars = None
    else:
        try:
            price_stars = int(text)
        except ValueError:
            await message.answer(_("admin_tariff_opt_price_invalid"), parse_mode="HTML")
            return

    fsm_data = await state.get_data()
    current_option: dict = fsm_data.get("current_option", {})
    current_option["price_stars"] = price_stars
    await state.update_data(current_option=current_option)

    class _FakeCallback:
        def __init__(self, msg):
            self.message = msg
        async def answer(self, *a, **kw):
            pass

    await _finalize_option(_FakeCallback(message), state, i18n, lang)


async def _finalize_option(callback_like: Any, state: FSMContext, i18n, lang: str):
    _ = _mk(i18n, lang)
    fsm_data = await state.get_data()
    options: list = list(fsm_data.get("options", []))
    current_option: dict = fsm_data.get("current_option", {})
    options.append(current_option)
    await state.update_data(options=options, current_option={})

    n = len(options)
    summary = _fmt_option_summary(current_option, n)
    text = _("admin_tariff_step_option_more") + f"\n\n{summary}"
    await callback_like.answer()
    if hasattr(callback_like.message, "edit_text"):
        await _edit_or_answer(callback_like.message, text, _opt_more_kb(i18n, lang))
    else:
        await callback_like.message.answer(text, reply_markup=_opt_more_kb(i18n, lang), parse_mode="HTML")
    await state.set_state(AdminStates.tariff_step_opt_more)


# ── FSM: Option — add more or done ──────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:opt_more", StateFilter(AdminStates.tariff_step_opt_more))
async def tariff_opt_more(callback: types.CallbackQuery, state: FSMContext,
                           i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    await _go_to_option_step(callback, state, i18n, lang)


@router.callback_query(F.data == "admin_tariff:opt_done", StateFilter(AdminStates.tariff_step_opt_more))
async def tariff_opt_done(callback: types.CallbackQuery, state: FSMContext,
                           i18n_data: dict, settings: Settings):
    lang, i18n = _get_i18n(i18n_data, settings)
    _ = _mk(i18n, lang)

    fsm_data = await state.get_data()
    summary = _build_creation_summary(fsm_data)
    text = _("admin_tariff_confirm", summary=summary)
    await _send_step(callback, text, _confirm_kb(i18n, lang), state, AdminStates.tariff_step_confirm)


# ── FSM: Confirm & Save ──────────────────────────────────────────────────────

@router.callback_query(F.data == "admin_tariff:confirm", StateFilter(AdminStates.tariff_step_confirm))
async def tariff_fsm_confirm(callback: types.CallbackQuery, state: FSMContext,
                              i18n_data: dict, settings: Settings, session: AsyncSession):
    lang, i18n = _get_i18n(i18n_data, settings)
    if not i18n or not callback.message:
        await callback.answer("Error.", show_alert=True)
        return
    _ = _mk(i18n, lang)

    fsm_data = await state.get_data()

    # Validate before saving
    options: list = fsm_data.get("options", [])
    if not options:
        await callback.answer(_("admin_tariff_no_options_error"), show_alert=True)
        return

    # Auto-generate slug
    name_ru: str = fsm_data.get("name_ru", "plan")
    base_slug = re.sub(r"[^a-z0-9]+", "-", name_ru.lower()).strip("-") or "plan"
    slug = base_slug
    counter = 2
    while True:
        existing = await pricing_plan_dal.get_plan_by_slug(session, slug)
        if existing is None:
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    try:
        plan = await pricing_plan_dal.create_plan(
            session,
            slug=slug,
            name_ru=fsm_data.get("name_ru"),
            name_en=fsm_data.get("name_en"),
            description_ru=fsm_data.get("desc_ru"),
            description_en=fsm_data.get("desc_en"),
            remnawave_squad_uuid=fsm_data.get("squad_uuid"),
            remnawave_squad_name_snapshot=fsm_data.get("squad_name"),
            plan_kind=fsm_data.get("plan_kind", "standalone"),
            billing_model=fsm_data.get("billing_model", "time"),
            traffic_reset_strategy=fsm_data.get("traffic_reset_strategy", "NO_RESET"),
            is_trial=bool(fsm_data.get("is_trial", False)),
            is_enabled=False,
            sort_order=0,
        )

        for opt in options:
            await pricing_plan_dal.create_plan_option(
                session,
                plan_id=plan.id,
                duration_months=opt.get("duration_months"),
                duration_days=opt.get("duration_days"),
                traffic_gb=opt.get("traffic_gb"),
                traffic_unlimited=bool(opt.get("traffic_unlimited", False)),
                price_rub=opt.get("price_rub"),
                price_stars=opt.get("price_stars"),
                is_enabled=True,
                sort_order=0,
            )

        await session.commit()
        await state.clear()

        text = _("admin_tariff_created", name=plan.name_ru, options_count=len(options))
        await _edit_or_answer(callback.message, text, None)
        await callback.answer()

        # Show updated list
        plans = await pricing_plan_dal.get_plans(session)
        count = len(plans)
        list_text = _("admin_tariffs_list_header", count=count) if count else _("admin_tariffs_empty")
        await callback.message.answer(list_text, reply_markup=_tariff_list_kb(i18n, lang, plans), parse_mode="HTML")

    except Exception as exc:
        logger.error("Failed to create tariff via bot FSM: %s", exc, exc_info=True)
        await callback.answer(_("admin_tariff_create_failed", error=str(exc)[:100]), show_alert=True)
