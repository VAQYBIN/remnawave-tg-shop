"""Email-уведомления об истечении подписки (Resend).

Отдельный модуль от web/auth/email_service.py (коды верификации): другие
тексты, CTA-кнопка продления и ссылка отписки. Живёт в core, потому что
отправка инициируется из контейнера бота (panel webhook), а не из web-api.
"""
import logging
from typing import Optional

import resend

logger = logging.getLogger(__name__)

KIND_PRE_EXPIRY = "pre_expiry"
KIND_EXPIRED = "expired"
KIND_EXPIRED_YESTERDAY = "expired_yesterday"

_TEXTS = {
    "ru": {
        "pre_expiry_subject": "Подписка истекает через {days_phrase} — {brand}",
        "pre_expiry_body": (
            "Ваша подписка {brand} истекает через {days_phrase} — {end_date}. "
            "Продлите её сейчас, чтобы не потерять доступ к VPN."
        ),
        "expired_subject": "Подписка истекла — {brand}",
        "expired_body": (
            "Ваша подписка {brand} истекла {end_date}. "
            "Продлите её, чтобы восстановить доступ к VPN."
        ),
        "expired_yesterday_subject": "Подписка истекла вчера — {brand}",
        "expired_yesterday_body": (
            "Ваша подписка {brand} истекла вчера ({end_date}). "
            "Продлите её, чтобы восстановить доступ к VPN."
        ),
        "cta": "Продлить подписку",
        "footer": "Вы получили это письмо, потому что у вас есть аккаунт {brand}.",
        "unsubscribe": "Отписаться от почтовых уведомлений",
    },
    "en": {
        "pre_expiry_subject": "Subscription expires in {days_phrase} — {brand}",
        "pre_expiry_body": (
            "Your {brand} subscription expires in {days_phrase} — {end_date}. "
            "Renew now to keep your VPN access."
        ),
        "expired_subject": "Subscription expired — {brand}",
        "expired_body": (
            "Your {brand} subscription expired on {end_date}. "
            "Renew to restore your VPN access."
        ),
        "expired_yesterday_subject": "Subscription expired yesterday — {brand}",
        "expired_yesterday_body": (
            "Your {brand} subscription expired yesterday ({end_date}). "
            "Renew to restore your VPN access."
        ),
        "cta": "Renew subscription",
        "footer": "You received this email because you have a {brand} account.",
        "unsubscribe": "Unsubscribe from email notifications",
    },
}

_KIND_KEYS = {
    KIND_PRE_EXPIRY: ("pre_expiry_subject", "pre_expiry_body"),
    KIND_EXPIRED: ("expired_subject", "expired_body"),
    KIND_EXPIRED_YESTERDAY: ("expired_yesterday_subject", "expired_yesterday_body"),
}


def _days_phrase(days: int, lang: str) -> str:
    if lang == "ru":
        if days % 10 == 1 and days % 100 != 11:
            word = "день"
        elif days % 10 in (2, 3, 4) and days % 100 not in (12, 13, 14):
            word = "дня"
        else:
            word = "дней"
        return f"{days} {word}"
    return f"{days} day" if days == 1 else f"{days} days"


def _build_html(
    body_text: str,
    cta_label: str,
    renew_url: str,
    brand: str,
    footer_text: str,
    unsubscribe_label: str,
    unsubscribe_url: Optional[str],
) -> str:
    unsubscribe_block = ""
    if unsubscribe_url:
        unsubscribe_block = (
            f'<br><a href="{unsubscribe_url}" '
            f'style="color:#897569;text-decoration:underline;">{unsubscribe_label}</a>'
        )
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F5F1ED;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F1ED;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#2AACDF;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">{brand}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;color:#2B2B2B;font-size:16px;line-height:1.5;">{body_text}</p>
              <div style="text-align:center;margin:0 0 8px;">
                <a href="{renew_url}"
                   style="display:inline-block;background-color:#2AACDF;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;">{cta_label}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #EDE9E5;">
              <p style="margin:0;color:#897569;font-size:12px;text-align:center;">
                {footer_text}{unsubscribe_block}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def render_expiry_email(
    *,
    kind: str,
    days_left: int,
    lang: str,
    brand: str,
    end_date: str,
    renew_url: str,
    unsubscribe_url: Optional[str] = None,
) -> tuple[str, str]:
    """Возвращает (subject, html). ValueError для неизвестного kind."""
    if kind not in _KIND_KEYS:
        raise ValueError(f"Unknown expiry email kind: {kind}")
    texts = _TEXTS.get(lang, _TEXTS["ru"])
    subject_key, body_key = _KIND_KEYS[kind]
    fmt = {
        "brand": brand,
        "end_date": end_date,
        "days_phrase": _days_phrase(days_left, lang if lang in _TEXTS else "ru"),
    }
    subject = texts[subject_key].format(**fmt)
    body_text = texts[body_key].format(**fmt)
    html = _build_html(
        body_text=body_text,
        cta_label=texts["cta"],
        renew_url=renew_url,
        brand=brand,
        footer_text=texts["footer"].format(brand=brand),
        unsubscribe_label=texts["unsubscribe"],
        unsubscribe_url=unsubscribe_url,
    )
    return subject, html


async def send_expiry_email(
    *,
    email: str,
    kind: str,
    days_left: int,
    lang: str,
    brand: str,
    end_date: str,
    renew_url: str,
    api_key: str,
    from_email: str,
    unsubscribe_url: Optional[str] = None,
) -> bool:
    """Отправка через Resend. True при успехе; исключения глотает и логирует."""
    try:
        subject, html = render_expiry_email(
            kind=kind,
            days_left=days_left,
            lang=lang,
            brand=brand,
            end_date=end_date,
            renew_url=renew_url,
            unsubscribe_url=unsubscribe_url,
        )
        resend.api_key = api_key
        params: resend.Emails.SendParams = {
            "from": from_email,
            "to": [email],
            "subject": subject,
            "html": html,
        }
        if unsubscribe_url:
            params["headers"] = {"List-Unsubscribe": f"<{unsubscribe_url}>"}
        resend.Emails.send(params)
        logger.info(
            "Expiry email sent to %s (kind=%s, days_left=%s)", email, kind, days_left
        )
        return True
    except Exception as exc:
        logger.error("Failed to send expiry email to %s: %s", email, exc)
        return False
