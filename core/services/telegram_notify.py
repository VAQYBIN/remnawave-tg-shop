"""
Direct Telegram Bot API notifications sent from the web layer.
Used for events that originate in the web API, not the bot process.
"""
import asyncio
import html
import logging
from datetime import datetime
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_PROVIDER_LABELS = {
    "yookassa": "YooKassa",
    "platega": "Platega",
    "freekassa": "FreeKassa",
    "severpay": "SeverPay",
    "lavapay": "LavaPay",
    "cryptopay": "CryptoPay",
    "stars": "Telegram Stars",
}


def _months_label(n: int) -> str:
    if n == 1:
        return "месяц"
    if 2 <= n <= 4:
        return "месяца"
    return "месяцев"


async def send_payment_reminder_after_delay(
    *,
    delay_seconds: int,
    session_factory,
    bot_token: str,
    telegram_user_id: int,
    payment_id: int,
    frontend_url: str,
    months: int,
    amount: float,
    currency: str,
    provider: str,
    original_amount: Optional[float] = None,
    discount_applied: Optional[float] = None,
    discount_percentage: Optional[int] = None,
    promo_code: Optional[str] = None,
) -> None:
    """Wait delay_seconds, then send a reminder only if the payment is still pending."""
    import asyncio

    await asyncio.sleep(delay_seconds)

    try:
        async with session_factory() as session:
            from core.dal.payment_dal import get_payment_by_db_id
            payment = await get_payment_by_db_id(session, payment_id)
            if not payment:
                return
            if payment.status not in ("pending", "pending_yookassa", "waiting_for_capture"):
                return
    except Exception as exc:
        logger.warning("Reminder pre-check failed for payment %s: %s", payment_id, exc)
        return

    await send_payment_created_notification(
        bot_token=bot_token,
        telegram_user_id=telegram_user_id,
        payment_id=payment_id,
        frontend_url=frontend_url,
        months=months,
        amount=amount,
        currency=currency,
        provider=provider,
        original_amount=original_amount,
        discount_applied=discount_applied,
        discount_percentage=discount_percentage,
        promo_code=promo_code,
    )


async def send_payment_created_notification(
    *,
    bot_token: str,
    telegram_user_id: int,
    payment_id: int,
    frontend_url: str,
    months: int,
    amount: float,
    currency: str,
    provider: str,
    original_amount: Optional[float] = None,
    discount_applied: Optional[float] = None,
    discount_percentage: Optional[int] = None,
    promo_code: Optional[str] = None,
) -> None:
    """Send a pending-payment notification to the user via Telegram."""
    pending_url = f"{frontend_url.rstrip('/')}/payment/{payment_id}"
    symbol = "₽" if currency == "RUB" else currency

    lines = [
        "💳 <b>У вас есть неоплаченный счёт</b>",
        "",
        f"📋 Тариф: <b>{months} {_months_label(months)}</b>",
    ]

    if original_amount and discount_applied:
        lines.append(
            f"💰 Сумма: <b>{amount:.0f} {symbol}</b>"
            f" (вместо {original_amount:.0f} {symbol},"
            f" скидка {discount_applied:.0f} {symbol})"
        )
    else:
        lines.append(f"💰 Сумма: <b>{amount:.0f} {symbol}</b>")

    if promo_code:
        pct_part = f" ({discount_percentage}%)" if discount_percentage else ""
        lines.append(f"🏷️ Промокод: <code>{promo_code}</code>{pct_part}")

    lines.append(f"💳 Провайдер: {_PROVIDER_LABELS.get(provider, provider)}")

    text = "\n".join(lines)
    keyboard = {
        "inline_keyboard": [[{"text": "💳 Оплатить", "url": pending_url}]]
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": telegram_user_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "reply_markup": keyboard,
                },
            )
        if resp.status_code != 200:
            logger.warning(
                "Telegram notify failed for user %s: %s",
                telegram_user_id,
                resp.text[:200],
            )
    except Exception as exc:
        logger.warning("Telegram notify exception for user %s: %s", telegram_user_id, exc)


# ─── Log-group notifications for web user actions ───────────────────────────────
# Mirror bot/services/notification_service.py (NotificationService), which posts to
# LOG_CHAT_ID, but for events that originate in the web API. Sent directly via the
# Bot API (the web process has no Bot/queue instance), with a "(сайт)" marker so
# admins can tell web actions apart from bot actions.


async def _send_to_log_group(
    *,
    bot_token: str,
    chat_id: int,
    text: str,
    thread_id: Optional[int] = None,
    profile_user_id: Optional[int] = None,
) -> None:
    """Post a message to the log group, retrying without the profile button if
    Telegram rejects the tg:// link (privacy restrictions)."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    base: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if thread_id:
        base["message_thread_id"] = thread_id

    payload = dict(base)
    if profile_user_id:
        payload["reply_markup"] = {
            "inline_keyboard": [[
                {"text": "👤 Открыть профиль", "url": f"tg://user?id={profile_user_id}"}
            ]]
        }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200 and profile_user_id:
                # tg:// profile links can be rejected (e.g. BUTTON_USER_PRIVACY_RESTRICTED)
                resp = await client.post(url, json=base)
            if resp.status_code != 200:
                logger.warning(
                    "Log-group notify failed for chat %s: %s",
                    chat_id,
                    resp.text[:200],
                )
    except Exception as exc:
        logger.warning("Log-group notify exception for chat %s: %s", chat_id, exc)


def _format_account_display(
    account,
    *,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
) -> str:
    """Build a human-readable, HTML-escaped display name for an account.

    Prefers explicit overrides (e.g. fresh OIDC claims), then the selectin-loaded
    Telegram profile, then email, then a bare id."""
    fn = first_name
    un = username
    if fn is None and un is None:
        tg_user = getattr(account, "telegram_user", None)
        if tg_user is not None:
            fn = tg_user.first_name
            un = tg_user.username

    if fn or un:
        display = html.escape(fn) if fn else "Пользователь"
        if un:
            uname = un if str(un).startswith("@") else f"@{un}"
            display = f"{display} ({html.escape(uname)})"
        return display

    if getattr(account, "email", None):
        return html.escape(account.email)
    if getattr(account, "telegram_user_id", None):
        return f"ID {account.telegram_user_id}"
    if getattr(account, "site_user_id", None):
        return f"site #{abs(account.site_user_id)}"
    return "Пользователь"


def _now_stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _schedule_log_group(settings, *, text: str, profile_user_id: Optional[int]) -> None:
    """Fire-and-forget the actual network send so it never blocks the HTTP response."""
    asyncio.ensure_future(
        _send_to_log_group(
            bot_token=settings.BOT_TOKEN,
            chat_id=settings.LOG_CHAT_ID,
            thread_id=settings.LOG_THREAD_ID,
            text=text,
            profile_user_id=profile_user_id,
        )
    )


async def notify_group_web_registration(
    settings,
    *,
    account,
    method: str,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    referred: bool = False,
) -> None:
    """New account created on the website (email signup or Telegram OIDC)."""
    if not settings.LOG_CHAT_ID or not settings.BOT_TOKEN or not settings.LOG_NEW_USERS:
        return

    display = _format_account_display(account, username=username, first_name=first_name)
    method_label = {"email": "📧 Email", "telegram": "✈️ Telegram"}.get(method, method)

    lines = ["👤 <b>Новый пользователь (сайт)</b>", ""]
    if account.telegram_user_id:
        lines.append(f"🆔 ID: <code>{account.telegram_user_id}</code>")
    elif account.email:
        lines.append(f"📧 Email: <code>{html.escape(account.email)}</code>")
    lines.append(f"👤 Имя: {display}")
    lines.append(f"🔑 Регистрация: {method_label}")
    if referred:
        lines.append("🔗 Источник: реферальная ссылка")
    lines.append(f"📅 Время: {_now_stamp()}")

    _schedule_log_group(
        settings,
        text="\n".join(lines),
        profile_user_id=account.telegram_user_id,
    )


async def notify_group_web_trial(
    settings,
    *,
    account,
    end_date: Optional[datetime],
) -> None:
    """Trial activated via the website."""
    if not settings.LOG_CHAT_ID or not settings.BOT_TOKEN or not settings.LOG_TRIAL_ACTIVATIONS:
        return

    display = _format_account_display(account)
    end_label = end_date.strftime("%Y-%m-%d %H:%M") if end_date else "—"

    text = "\n".join([
        "🆓 <b>Активирован триал (сайт)</b>",
        "",
        f"👤 Пользователь: {display}",
        f"⏰ Действует до: <b>{end_label}</b>",
        f"🕐 Время: {_now_stamp()}",
    ])

    _schedule_log_group(settings, text=text, profile_user_id=account.telegram_user_id)


async def notify_group_web_promo_discount(
    settings,
    *,
    account,
    promo_code: str,
    discount_percentage: int,
) -> None:
    """Discount promo code applied via the website."""
    if not settings.LOG_CHAT_ID or not settings.BOT_TOKEN or not settings.LOG_PROMO_ACTIVATIONS:
        return

    display = _format_account_display(account)

    text = "\n".join([
        "💰 <b>Активирован промокод на скидку (сайт)</b>",
        "",
        f"👤 Пользователь: {display}",
        f"🏷 Код: <code>{html.escape(promo_code)}</code>",
        f"💵 Скидка: <b>{discount_percentage}%</b>",
        f"🕐 Время: {_now_stamp()}",
    ])

    _schedule_log_group(settings, text=text, profile_user_id=account.telegram_user_id)
