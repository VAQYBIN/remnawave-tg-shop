import logging
from typing import Optional

import resend

logger = logging.getLogger(__name__)

DEFAULT_BRAND = "VPN"

PURPOSE_SUBJECT_TEMPLATES = {
    "register": "Код подтверждения регистрации — {brand}",
    "login": "Код для входа — {brand}",
    "reset_password": "Код сброса пароля — {brand}",
    "change_email": "Код подтверждения смены email — {brand}",
    "link_email": "Код привязки email — {brand}",
}

PURPOSE_BODY_TEMPLATES = {
    "register": "Ваш код для завершения регистрации",
    "login": "Ваш код для входа",
    "reset_password": "Ваш код для сброса пароля",
    "change_email": "Ваш код для подтверждения смены email",
    "link_email": "Ваш код для привязки email к аккаунту {brand}",
}


def _build_html(purpose: str, code: str, brand: str) -> str:
    body_text = PURPOSE_BODY_TEMPLATES.get(purpose, "Ваш код подтверждения").format(brand=brand)
    return f"""
<!DOCTYPE html>
<html lang="ru">
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
              <p style="margin:0 0 16px;color:#2B2B2B;font-size:16px;">{body_text}:</p>
              <div style="background:#F5F1ED;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2AACDF;">{code}</span>
              </div>
              <p style="margin:0;color:#897569;font-size:14px;">Код действителен 10 минут. Не передавайте его никому.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #EDE9E5;">
              <p style="margin:0;color:#897569;font-size:12px;text-align:center;">
                Если вы не запрашивали этот код, проигнорируйте письмо.
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


async def send_verification_code(
    email: str,
    code: str,
    purpose: str,
    api_key: str,
    from_email: str,
    brand: Optional[str] = None,
) -> bool:
    """
    Send verification code via Resend.
    `brand` is the brand name shown in subject and email body. Defaults to DEFAULT_BRAND.
    Returns True on success, False on failure.
    """
    brand_name = brand or DEFAULT_BRAND
    try:
        resend.api_key = api_key
        subject_template = PURPOSE_SUBJECT_TEMPLATES.get(purpose, "Код подтверждения — {brand}")
        subject = subject_template.format(brand=brand_name)
        html = _build_html(purpose, code, brand_name)

        params: resend.Emails.SendParams = {
            "from": from_email,
            "to": [email],
            "subject": subject,
            "html": html,
        }
        resend.Emails.send(params)
        logger.info("Verification email sent to %s for purpose=%s", email, purpose)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", email, exc)
        return False
