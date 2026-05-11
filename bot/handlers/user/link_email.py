"""
Handler for /link_email command — lets Telegram users link an email to their account
so they can log in on the web dashboard.
"""
import logging
import re
from typing import Optional

from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from bot.middlewares.i18n import JsonI18n
from bot.states.user_states import LinkEmailStates
from bot.keyboards.inline.user_keyboards import get_back_to_main_menu_markup

logger = logging.getLogger(__name__)

router = Router(name="link_email_router")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


# ─── /link_email command ─────────────────────────────────────────────────────

@router.message(Command("link_email"))
async def cmd_link_email(
    message: types.Message,
    state: FSMContext,
    settings: Settings,
    i18n_data: dict,
    session: AsyncSession,
):
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    _ = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    # Check if account is already linked
    from core.dal.account_dal import get_account_by_telegram_id
    account = await get_account_by_telegram_id(session, message.from_user.id)

    if account and account.email and account.is_email_verified:
        await message.answer(
            _("link_email_already_linked", email=account.email),
            reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
        )
        return

    site = settings.WEB_FRONTEND_URL.replace("https://", "").replace("http://", "").rstrip("/")
    await state.set_state(LinkEmailStates.waiting_for_email)
    await message.answer(
        _("link_email_prompt", site=site),
        reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
    )


# ─── Email input ──────────────────────────────────────────────────────────────

@router.message(LinkEmailStates.waiting_for_email, F.text)
async def process_email_input(
    message: types.Message,
    state: FSMContext,
    settings: Settings,
    i18n_data: dict,
    session: AsyncSession,
):
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    _ = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    email = message.text.strip().lower() if message.text else ""

    if not EMAIL_REGEX.match(email):
        await message.answer(
            _("link_email_invalid_email"),
            reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
        )
        return

    # Check if email is already used by another account
    from core.dal.account_dal import get_account_by_email
    existing = await get_account_by_email(session, email)
    if existing and existing.telegram_user_id != message.from_user.id:
        await message.answer(
            _("link_email_already_taken"),
            reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
        )
        return

    # Send verification code
    from core.dal.account_dal import get_account_by_telegram_id, create_account
    from core.dal.email_verification_code_dal import create_verification_code

    account = await get_account_by_telegram_id(session, message.from_user.id)
    if not account:
        account = await create_account(
            session,
            telegram_user_id=message.from_user.id,
            language_code=current_lang,
        )

    code_record = await create_verification_code(
        session, email=email, purpose="link_email", account_id=account.id
    )

    if settings.RESEND_API_KEY:
        from web.auth.email_service import send_verification_code
        from core.dal.site_settings_dal import get_site_settings
        site_settings = await get_site_settings(session)
        try:
            await send_verification_code(
                email=email,
                code=code_record.code,
                purpose="link_email",
                api_key=settings.RESEND_API_KEY,
                from_email=settings.RESEND_FROM_EMAIL,
                brand=site_settings.brand_name,
            )
        except Exception as exc:
            logger.error("Failed to send link_email verification code: %s", exc)
            await message.answer(
                _("link_email_send_failed"),
                reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
            )
            await state.clear()
            return
    else:
        logger.warning("RESEND_API_KEY not set; skipping email send for link_email (code: %s)", code_record.code)

    await state.update_data(email=email, account_id=str(account.id))
    await state.set_state(LinkEmailStates.waiting_for_code)
    await message.answer(
        _("link_email_code_sent", email=email),
        reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
    )


# ─── Code input ───────────────────────────────────────────────────────────────

@router.message(LinkEmailStates.waiting_for_code, F.text)
async def process_code_input(
    message: types.Message,
    state: FSMContext,
    settings: Settings,
    i18n_data: dict,
    session: AsyncSession,
):
    current_lang = i18n_data.get("current_language", settings.DEFAULT_LANGUAGE)
    i18n: Optional[JsonI18n] = i18n_data.get("i18n_instance")
    _ = lambda key, **kw: i18n.gettext(current_lang, key, **kw) if i18n else key

    code_input = message.text.strip() if message.text else ""
    state_data = await state.get_data()
    email = state_data.get("email", "")

    from core.dal.email_verification_code_dal import get_active_code, mark_code_used
    from core.dal.account_dal import update_account, get_account_by_telegram_id
    import uuid

    code_record = await get_active_code(session, email=email, purpose="link_email", code=code_input)
    if not code_record:
        await message.answer(
            _("link_email_invalid_code"),
            reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
        )
        return

    await mark_code_used(session, code_record.id)

    account = await get_account_by_telegram_id(session, message.from_user.id)
    if account:
        await update_account(session, account.id, email=email, is_email_verified=True)

    await state.clear()
    await message.answer(
        _("link_email_success", email=email, frontend_url=settings.WEB_FRONTEND_URL),
        reply_markup=get_back_to_main_menu_markup(current_lang, i18n),
    )
