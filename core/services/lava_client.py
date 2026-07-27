"""Клиент Lava Business API (api.lava.ru) — общий для бота и веба.

Контракт (dev.lava.ru, редирект на developer.lava.ru):

* Базовый URL ``https://api.lava.ru``, эндпоинты ``/business/invoice/create``
  и ``/business/invoice/status``.
* Исходящий запрос подписывается ``HMAC-SHA256(raw_body, LAVAPAY_SECRET_KEY)``
  → hex в заголовке ``Signature``. Подписываются РОВНО те байты, что уходят в
  запрос: любая пересортировка ключей ломает подпись.
* Вебхук подписан вторым ключом магазина (additional key,
  ``LAVAPAY_WEBHOOK_SECRET``) и приходит в заголовке ``Authorization``. Разные
  магазины подписывают то raw body, то пере-сериализованный JSON со
  sort_keys — принимаем обе канонизации, но подпись обязательна всегда.
* ``successUrl``/``failUrl`` не должны содержать query string — Lava отвечает
  422 «ошибочный формат ссылки».
"""
import hashlib
import hmac
import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional
from urllib.parse import urlsplit, urlunsplit

import httpx

logger = logging.getLogger(__name__)

BASE_URL_DEFAULT = "https://api.lava.ru"
CREATE_INVOICE_PATH = "/business/invoice/create"
INVOICE_STATUS_PATH = "/business/invoice/status"

# Lava допускает срок жизни счёта 1..7200 минут
EXPIRE_MINUTES_MIN = 1
EXPIRE_MINUTES_MAX = 7200

_SUCCESS_STATUSES = {"success", "succeeded", "paid", "completed"}
_FAILED_STATUSES = {"cancel", "canceled", "cancelled", "expired", "error", "failed", "declined"}

# Заголовки, в которых может прийти подпись вебхука (Authorization — основной)
WEBHOOK_SIGNATURE_HEADERS = ("Authorization", "Signature", "X-Signature")
_SIGNATURE_PREFIXES = ("bearer ", "signature ", "hmac-sha256 ", "sha256=")


class LavaApiError(Exception):
    """Ошибка Lava Business API (HTTP-ошибка либо status=error в ответе)."""


def is_configured(settings) -> bool:
    """Провайдер готов к работе.

    Webhook-секрет обязателен: без него нельзя доверять уведомлению об оплате,
    а значит нечем подтвердить платёж — такой провайдер не предлагаем вовсе.
    """
    return bool(
        getattr(settings, "LAVAPAY_ENABLED", False)
        and getattr(settings, "LAVAPAY_SHOP_ID", None)
        and getattr(settings, "LAVAPAY_SECRET_KEY", None)
        and getattr(settings, "LAVAPAY_WEBHOOK_SECRET", None)
    )


def sign_body(secret: str, body: bytes) -> str:
    return hmac.new((secret or "").encode("utf-8"), body, hashlib.sha256).hexdigest()


def canonical_json(payload: dict[str, Any]) -> bytes:
    """JSON со sort_keys (эквивалент php ksort + json_encode).

    Поле ``signature`` исключается, ``float n.0`` приводится к int — так
    подписывают вебхуки магазины на старом PHP SDK.
    """
    def normalise(value: Any) -> Any:
        if isinstance(value, bool):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, dict):
            return {k: normalise(v) for k, v in value.items() if k != "signature"}
        if isinstance(value, list):
            return [normalise(v) for v in value]
        return value

    without_sig = {k: normalise(v) for k, v in payload.items() if k != "signature"}
    return json.dumps(without_sig, sort_keys=True, separators=(",", ":")).encode("utf-8")


def normalise_signature_header(value: Optional[str]) -> str:
    """Убирает схему авторизации (``Bearer <sig>``) и пробелы."""
    cleaned = (value or "").strip()
    lowered = cleaned.lower()
    for prefix in _SIGNATURE_PREFIXES:
        if lowered.startswith(prefix):
            return cleaned[len(prefix):].strip()
    return cleaned


def verify_webhook(secret: Optional[str], raw_body: bytes, received_signature: Optional[str]) -> bool:
    """Проверка подписи вебхука. Fail-closed: любые сомнения → False."""
    if not secret:
        logger.error("LavaPay webhook: LAVAPAY_WEBHOOK_SECRET не задан — уведомление отклонено")
        return False

    received = normalise_signature_header(received_signature)
    if not received:
        logger.warning("LavaPay webhook: отсутствует заголовок подписи")
        return False

    if hmac.compare_digest(sign_body(secret, raw_body).lower(), received.lower()):
        return True

    # Fallback: магазины, подписывающие пере-сериализованный JSON со sort_keys
    try:
        payload = json.loads(raw_body)
    except (ValueError, TypeError):
        logger.warning("LavaPay webhook: тело не является JSON, подпись не совпала")
        return False

    if isinstance(payload, dict) and hmac.compare_digest(
        sign_body(secret, canonical_json(payload)).lower(), received.lower()
    ):
        return True

    logger.warning("LavaPay webhook: неверная подпись (получено %s…)", received[:8])
    return False


def map_invoice_status(raw_status: Optional[str]) -> str:
    """Статус Lava → внутренний: succeeded / failed / pending."""
    status = (raw_status or "").strip().lower()
    if status in _SUCCESS_STATUSES:
        return "succeeded"
    if status in _FAILED_STATUSES:
        return "failed"
    return "pending"


def amount_to_decimal(value: Any) -> Decimal:
    """Сумма в рублях с двумя знаками — для сверки с записью платежа."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _strip_query(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


class LavaClient:
    """Тонкая обёртка над Lava Business API."""

    def __init__(self, settings, transport: Optional[httpx.BaseTransport] = None, timeout: float = 20.0):
        self.settings = settings
        self._transport = transport
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        return is_configured(self.settings)

    @property
    def base_url(self) -> str:
        return (getattr(self.settings, "LAVAPAY_BASE_URL", None) or BASE_URL_DEFAULT).rstrip("/")

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        # ВАЖНО: подписываем ровно те байты, которые отправляем
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Signature": sign_body(self.settings.LAVAPAY_SECRET_KEY or "", body),
        }
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
            response = await client.post(f"{self.base_url}{path}", content=body, headers=headers)

        try:
            data = response.json()
        except ValueError:
            data = {}
        if not isinstance(data, dict):
            data = {}

        if response.status_code >= 400:
            message = data.get("error") or data.get("message") or response.text[:200]
            logger.error("LavaPay API %s → %s: %s", path, response.status_code, message)
            raise LavaApiError(f"Lava API error {response.status_code}: {message}")

        if str(data.get("status", "")).lower() == "error":
            message = data.get("error") or data.get("message") or "unknown error"
            logger.error("LavaPay API %s → status=error: %s", path, message)
            raise LavaApiError(f"Lava API error: {message}")

        return data

    async def create_invoice(
        self,
        *,
        amount: float,
        order_id: str,
        hook_url: Optional[str] = None,
        success_url: Optional[str] = None,
        fail_url: Optional[str] = None,
        comment: Optional[str] = None,
        custom_fields: Optional[str] = None,
        expire_minutes: Optional[int] = None,
    ) -> dict[str, str]:
        """POST /business/invoice/create → {"invoice_id", "url"}."""
        payload: dict[str, Any] = {
            "sum": float(amount_to_decimal(amount)),
            "orderId": str(order_id),
            "shopId": self.settings.LAVAPAY_SHOP_ID,
        }
        if hook_url:
            payload["hookUrl"] = hook_url[:500]
        success = _strip_query(success_url or getattr(self.settings, "LAVAPAY_RETURN_URL", None))
        if success:
            payload["successUrl"] = success[:500]
        failure = _strip_query(fail_url or getattr(self.settings, "LAVAPAY_FAIL_URL", None) or success)
        if failure:
            payload["failUrl"] = failure[:500]
        expire = expire_minutes if expire_minutes is not None else getattr(self.settings, "LAVAPAY_EXPIRE_MINUTES", None)
        if expire is not None:
            payload["expire"] = max(EXPIRE_MINUTES_MIN, min(EXPIRE_MINUTES_MAX, int(expire)))
        if comment:
            payload["comment"] = comment[:255]
        if custom_fields:
            payload["customFields"] = custom_fields[:500]

        data = await self._post(CREATE_INVOICE_PATH, payload)
        body = data.get("data") if isinstance(data.get("data"), dict) else data
        redirect_url = body.get("url") or body.get("paymentUrl") or body.get("payment_url")
        if not redirect_url:
            raise LavaApiError("Lava API: в ответе нет ссылки на оплату")
        return {
            "invoice_id": str(body.get("id") or body.get("invoiceId") or order_id),
            "url": str(redirect_url),
        }

    async def get_invoice_status(self, *, order_id: Optional[str] = None, invoice_id: Optional[str] = None) -> dict[str, Any]:
        """POST /business/invoice/status — для ручной сверки платежа."""
        if not order_id and not invoice_id:
            raise ValueError("get_invoice_status: нужен order_id или invoice_id")
        payload: dict[str, Any] = {"shopId": self.settings.LAVAPAY_SHOP_ID}
        if invoice_id:
            payload["invoiceId"] = str(invoice_id)
        if order_id:
            payload["orderId"] = str(order_id)
        return await self._post(INVOICE_STATUS_PATH, payload)

    def verify_webhook_signature(self, raw_body: bytes, received_signature: Optional[str]) -> bool:
        return verify_webhook(
            getattr(self.settings, "LAVAPAY_WEBHOOK_SECRET", None), raw_body, received_signature
        )
