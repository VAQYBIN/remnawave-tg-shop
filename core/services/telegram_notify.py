"""
Direct Telegram Bot API notifications sent from the web layer.
Used for events that originate in the web API, not the bot process.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_PROVIDER_LABELS = {
    "yookassa": "YooKassa",
    "platega": "Platega",
    "freekassa": "FreeKassa",
    "severpay": "SeverPay",
    "cryptopay": "CryptoPay",
    "stars": "Telegram Stars",
}


def _months_label(n: int) -> str:
    if n == 1:
        return "месяц"
    if 2 <= n <= 4:
        return "месяца"
    return "месяцев"


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
