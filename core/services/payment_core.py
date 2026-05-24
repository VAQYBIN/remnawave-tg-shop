"""
Payment creation for the web — provider-specific async functions using httpx.
Webhook processing remains in bot/services/ (unchanged).
"""
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple, List

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings

logger = logging.getLogger(__name__)


def get_plan_price(settings: Settings, months: int) -> Optional[int]:
    """Return plan price in RUB for given months, or None if not available."""
    price_map = {
        1: settings.RUB_PRICE_1_MONTH,
        3: settings.RUB_PRICE_3_MONTHS,
        6: settings.RUB_PRICE_6_MONTHS,
        12: settings.RUB_PRICE_12_MONTHS,
    }
    enabled_map = {
        1: settings.MONTH_1_ENABLED,
        3: settings.MONTH_3_ENABLED,
        6: settings.MONTH_6_ENABLED,
        12: settings.MONTH_12_ENABLED,
    }
    if not enabled_map.get(months):
        return None
    return price_map.get(months)


def get_available_providers(settings: Settings) -> List[str]:
    """Return list of enabled, web-compatible payment provider keys (no Stars) from env vars."""
    providers = []
    if settings.YOOKASSA_ENABLED and settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY:
        providers.append("yookassa")
    if settings.PLATEGA_ENABLED and settings.PLATEGA_MERCHANT_ID and settings.PLATEGA_SECRET:
        providers.append("platega")
    if settings.FREEKASSA_ENABLED and settings.FREEKASSA_MERCHANT_ID and settings.FREEKASSA_FIRST_SECRET:
        providers.append("freekassa")
    if settings.SEVERPAY_ENABLED and settings.SEVERPAY_MID and settings.SEVERPAY_TOKEN:
        providers.append("severpay")
    if settings.CRYPTOPAY_ENABLED and settings.CRYPTOPAY_TOKEN:
        providers.append("cryptopay")
    return providers


async def get_available_providers_db(db: AsyncSession, settings: Settings) -> List[str]:
    """Return enabled providers in DB order. Falls back to env vars if DB has no enabled entries."""
    from core.dal.payment_provider_config_dal import get_enabled_providers
    db_providers = await get_enabled_providers(db)
    if db_providers:
        # Filter by credentials still present in env vars (DB enables only if credentials exist)
        env_available = set(get_available_providers(settings))
        return [p.provider_key for p in db_providers if p.provider_key in env_available]
    # Legacy: fall back to env vars order
    return get_available_providers(settings)


async def get_plan_price_db(db: AsyncSession, settings: Settings, months: int) -> Optional[float]:
    """Return plan price from DB. Falls back to env vars if no DB plan found."""
    from core.dal.pricing_plan_dal import get_plan_by_months
    plan = await get_plan_by_months(db, months)
    if plan and plan.price_rub is not None:
        return float(plan.price_rub)
    # Legacy: fall back to env vars
    return get_plan_price(settings, months)


async def _create_yookassa_payment(
    settings: Settings,
    *,
    payment_db_id: int,
    user_id: int,
    months: int,
    amount: float,
    description: str,
    return_url: str,
    idempotency_key: str,
) -> Tuple[str, str]:
    """Returns (provider_payment_id, redirect_url)."""
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "description": description,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "metadata": {
            "payment_db_id": str(payment_db_id),
            "user_id": str(user_id),
            "subscription_months": str(months),
            "sale_mode": "subscription",
        },
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.yookassa.ru/v3/payments",
            json=payload,
            auth=(settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY),
            headers={"Idempotence-Key": idempotency_key},
        )

    if resp.status_code not in (200, 201):
        logger.error(f"YooKassa error: {resp.status_code} {resp.text[:500]}")
        raise RuntimeError(f"YooKassa API error: {resp.status_code}")

    data = resp.json()
    provider_id = data["id"]
    redirect_url = data["confirmation"]["confirmation_url"]
    return provider_id, redirect_url


async def _create_platega_payment(
    settings: Settings,
    *,
    payment_db_id: int,
    amount: float,
    description: str,
    return_url: str,
) -> Tuple[str, str]:
    """Returns (provider_payment_id, redirect_url)."""
    body = {
        "paymentMethod": int(settings.PLATEGA_PAYMENT_METHOD),
        "paymentDetails": {
            "amount": float(amount),
            "currency": "RUB",
        },
        "description": description,
        "return": return_url,
        "failedUrl": return_url,
        "payload": str(payment_db_id),
    }
    clean_body = {k: v for k, v in body.items() if v not in (None, "")}

    base_url = (settings.PLATEGA_BASE_URL or "https://app.platega.io").rstrip("/")
    headers = {
        "X-MerchantId": settings.PLATEGA_MERCHANT_ID or "",
        "X-Secret": settings.PLATEGA_SECRET or "",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base_url}/transaction/process", json=clean_body, headers=headers
        )

    if resp.status_code != 200:
        logger.error(f"Platega error: {resp.status_code} {resp.text[:500]}")
        raise RuntimeError(f"Platega API error: {resp.status_code}")

    data = resp.json()
    provider_id = str(data.get("id") or data.get("transactionId") or payment_db_id)
    redirect_url = data.get("redirectUrl") or data.get("paymentUrl") or data.get("url")
    if not redirect_url:
        raise RuntimeError("Platega: no redirect URL in response")
    return provider_id, redirect_url


def _create_freekassa_url(
    settings: Settings,
    *,
    payment_db_id: int,
    amount: float,
    return_url: str,
) -> Tuple[str, str]:
    """Returns (order_id, redirect_url) — FreeKassa uses redirect URL directly."""
    import urllib.parse

    merchant_id = settings.FREEKASSA_MERCHANT_ID
    first_secret = settings.FREEKASSA_FIRST_SECRET
    currency = "RUB"
    order_id = str(payment_db_id)
    amount_str = f"{amount:.2f}"

    sign_string = f"{merchant_id}:{amount_str}:{first_secret}:{currency}:{order_id}"
    sign = hashlib.md5(sign_string.encode("utf-8"), usedforsecurity=False).hexdigest()  # noqa: S324 — FreeKassa protocol requires MD5

    base_url = (settings.FREEKASSA_PAYMENT_URL or "https://pay.freekassa.ru/").rstrip("/")
    params: dict = {
        "m": merchant_id,
        "oa": amount_str,
        "currency": currency,
        "o": order_id,
        "s": sign,
        "us_payment_db_id": order_id,
    }
    if settings.FREEKASSA_PAYMENT_METHOD_ID:
        params["i"] = str(settings.FREEKASSA_PAYMENT_METHOD_ID)

    redirect_url = base_url + "/?" + urllib.parse.urlencode(params)
    return order_id, redirect_url


async def _create_severpay_payment(
    settings: Settings,
    *,
    payment_db_id: int,
    user_id: int,
    amount: float,
    return_url: str,
) -> Tuple[str, str]:
    """Returns (provider_payment_id, redirect_url)."""
    amount_str = str(Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    extra: dict = {
        "order_id": str(payment_db_id),
        "amount": amount_str,
        "currency": "RUB",
        "client_email": f"{user_id}@telegram.org",
        "client_id": str(user_id),
        "url_return": return_url,
    }
    if settings.SEVERPAY_LIFETIME_MINUTES:
        extra["lifetime"] = int(settings.SEVERPAY_LIFETIME_MINUTES)

    # Build signed body (mid + salt + extra, sorted, then sign)
    body: dict = {
        "mid": settings.SEVERPAY_MID,
        "salt": secrets.token_hex(8),
    }
    body.update(extra)
    sorted_body = dict(sorted(body.items()))
    message = json.dumps(sorted_body, ensure_ascii=False, separators=(",", ":"))
    signature = hmac.new(
        (settings.SEVERPAY_TOKEN or "").encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    sorted_body["sign"] = signature

    base_url = (settings.SEVERPAY_BASE_URL or "https://severpay.io/api/merchant").rstrip("/")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{base_url}/payin/create", json=sorted_body)

    if resp.status_code != 200 or not resp.json().get("status"):
        logger.error(f"SeverPay error: {resp.status_code} {resp.text[:500]}")
        raise RuntimeError(f"SeverPay API error: {resp.status_code}")

    data = resp.json().get("data") or resp.json()
    provider_id = str(data.get("id") or data.get("uid") or payment_db_id)
    redirect_url = data.get("link") or data.get("url") or data.get("paymentUrl")
    if not redirect_url:
        raise RuntimeError("SeverPay: no redirect URL in response")
    return provider_id, redirect_url


async def _create_cryptopay_invoice(
    settings: Settings,
    *,
    payment_db_id: int,
    user_id: int,
    months: int,
    amount: float,
    description: str,
    return_url: str,
) -> Tuple[str, str]:
    """Returns (invoice_id, bot_invoice_url)."""
    network = settings.CRYPTOPAY_NETWORK or "mainnet"
    base_url = (
        "https://pay.crypt.bot/api"
        if network == "mainnet"
        else "https://testnet-pay.crypt.bot/api"
    )

    # The payload JSON is how the bot webhook handler identifies the payment
    invoice_payload = json.dumps({
        "user_id": str(user_id),
        "subscription_months": str(months),
        "payment_db_id": str(payment_db_id),
        "sale_mode": "subscription",
    })

    body: dict = {
        "amount": f"{amount:.2f}",
        "description": description,
        "payload": invoice_payload,
        "paid_btn_name": "callback",
        "paid_btn_url": return_url,
    }
    if settings.CRYPTOPAY_CURRENCY_TYPE == "fiat":
        body["currency_type"] = "fiat"
        body["fiat"] = settings.CRYPTOPAY_ASSET or "RUB"
    else:
        body["asset"] = settings.CRYPTOPAY_ASSET or "USDT"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base_url}/createInvoice",
            json=body,
            headers={"Crypto-Pay-API-Token": settings.CRYPTOPAY_TOKEN or ""},
        )

    if resp.status_code not in (200, 201):
        logger.error(f"CryptoPay error: {resp.status_code} {resp.text[:500]}")
        raise RuntimeError(f"CryptoPay API error: {resp.status_code}")

    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"CryptoPay API error: {data}")

    invoice = data["result"]
    provider_id = str(invoice["invoice_id"])
    bot_invoice_url = invoice.get("bot_invoice_url") or invoice.get("pay_url")
    return provider_id, bot_invoice_url


async def create_web_payment(
    db: AsyncSession,
    settings: Settings,
    *,
    account,
    provider: str,
    months: Optional[int] = None,
    plan_option_id: Optional[int] = None,
    promo_code: Optional[str] = None,
) -> Tuple[int, str]:
    """
    Create a pending Payment record and call the provider API.
    Returns (payment_db_id, redirect_url).
    Raises ValueError for invalid input, RuntimeError for provider errors.
    Accepts either months (legacy) or plan_option_id (new catalog flow).
    """
    from core.dal import payment_dal, active_discount_dal, promo_code_dal
    from core.services.promo_core import validate_discount_promo_code, calculate_discounted_price

    available = await get_available_providers_db(db, settings)
    if provider not in available:
        raise ValueError(f"Провайдер '{provider}' недоступен")

    # ── Resolve price and metadata from plan_option_id or months ──────────
    pricing_plan_id: Optional[int] = None
    pricing_plan_option_id_val: Optional[int] = None
    sale_mode: Optional[str] = None
    duration_months_val: Optional[int] = None
    duration_days_val: Optional[int] = None

    from core.dal.account_dal import get_effective_payment_user_id
    user_id = await get_effective_payment_user_id(db, account)
    bundle_snapshot_json: Optional[str] = None

    if plan_option_id is not None:
        from core.dal.pricing_plan_dal import get_plan_option_by_id
        opt = await get_plan_option_by_id(db, plan_option_id)
        if opt is None or not opt.is_enabled or opt.plan is None:
            raise ValueError("Выбранный вариант тарифа недоступен")
        # plan.is_enabled-guard уносится в can_purchase_plan_option (archived planам
        # is_enabled принудительно False, но продление владельцу разрешено).
        if opt.price_rub is None:
            raise ValueError("Для данного варианта не задана цена в рублях")

        pricing_plan_id = opt.plan_id
        pricing_plan_option_id_val = opt.id
        sale_mode = opt.plan.plan_kind  # "standalone" | "addon"
        duration_months_val = opt.duration_months
        duration_days_val = opt.duration_days
        duration_display = (
            f"{opt.duration_months} мес." if opt.duration_months
            else f"{opt.duration_days} дн." if opt.duration_days
            else ""
        )
        description = f"Оплата тарифа «{opt.plan.name_ru}»" + (f" — {duration_display}" if duration_display else "")
        # Ensure a non-None integer for legacy metadata (day-based options use day/30 approx)
        months_for_legacy = opt.duration_months or (
            max(1, round(opt.duration_days / 30.0)) if opt.duration_days else 0
        )

        # Единый guard: archived можно купить только как продление своего же тарифа
        from core.services.plan_purchase_policy import can_purchase_plan_option
        from core.dal.account_dal import get_account_user_ids
        _user_ids_for_policy = get_account_user_ids(account) or []
        allowed, _reason = await can_purchase_plan_option(db, _user_ids_for_policy, opt)
        if not allowed:
            raise ValueError("Этот тариф недоступен для покупки")

        if opt.plan.plan_kind == "addon":
            # For addon options the price must be prorated against the remaining standalone period.
            from core.dal.account_dal import get_effective_payment_user_id as _get_uid
            from core.dal.plan_entitlement_dal import get_active_standalone_entitlement
            from core.services.tariff_pricing import prorate_option
            from datetime import datetime, timezone as _tz

            _user_id_for_prorate = await _get_uid(db, account)
            standalone_ent = await get_active_standalone_entitlement(db, _user_id_for_prorate)
            if standalone_ent is None or standalone_ent.ends_at is None:
                raise ValueError("Для покупки дополнения необходима активная подписка")

            _now = datetime.now(_tz.utc)
            prorated_rub, _prorated_stars = prorate_option(
                price_rub=float(opt.price_rub),
                price_stars=opt.price_stars,
                duration_months=opt.duration_months,
                duration_days=opt.duration_days,
                plan_min_price_rub=float(opt.plan.min_price_rub) if opt.plan.min_price_rub is not None else None,
                plan_min_price_stars=opt.plan.min_price_stars,
                standalone_ends_at=standalone_ent.ends_at,
                now=_now,
                global_min_rub=getattr(settings, "MIN_PRORATED_PRICE_RUB", None),
                global_min_stars=getattr(settings, "MIN_PRORATED_PRICE_STARS", None),
            )
            if prorated_rub is None:
                raise ValueError("Не удалось рассчитать стоимость дополнения")
            price_rub = prorated_rub
        else:
            price_rub = float(opt.price_rub)
            from core.services.tariff_renewal_bundle import build_standalone_renewal_bundle
            bundle = await build_standalone_renewal_bundle(
                db,
                user_id=user_id,
                standalone_option=opt,
            )
            if bundle:
                if bundle["total_price_rub"] is None:
                    raise ValueError("Не удалось рассчитать стоимость bundled-продления")
                price_rub = float(bundle["total_price_rub"])
                bundle_snapshot_json = bundle["snapshot_json"]
    elif months is not None:
        price_rub_maybe = await get_plan_price_db(db, settings, months)
        if price_rub_maybe is None:
            raise ValueError(f"Тариф на {months} мес. недоступен")
        price_rub = float(price_rub_maybe)
        sale_mode = "legacy"
        duration_months_val = months
        months_for_legacy = months
        description = f"Оплата подписки на {months} мес."
    else:
        raise ValueError("Укажите months или plan_option_id")

    original_amount = float(price_rub)
    final_amount = original_amount
    discount_amount: Optional[float] = None
    promo_code_db_id: Optional[int] = None

    if promo_code:
        code_upper = promo_code.strip().upper()
        promo_obj = await promo_code_dal.get_active_discount_promo_code_by_code_str(db, code_upper)
        active_disc = await active_discount_dal.get_active_discount(db, user_id)

        if (
            active_disc
            and promo_obj
            and active_disc.promo_code_id == promo_obj.promo_code_id
        ):
            # Скидка уже зарезервирована через /promo/apply — используем как есть
            final_amount, discount_amount = calculate_discounted_price(
                original_amount, active_disc.discount_percentage
            )
            promo_code_db_id = active_disc.promo_code_id
        else:
            # Резервация ещё не была создана — валидируем и резервируем
            is_valid, discount_pct, _ = await validate_discount_promo_code(db, user_id, promo_code)
            if is_valid and discount_pct:
                final_amount, discount_amount = calculate_discounted_price(original_amount, discount_pct)
                if promo_obj:
                    promo_code_db_id = promo_obj.promo_code_id
    else:
        active_disc = await active_discount_dal.get_active_discount(db, user_id)
        if active_disc:
            final_amount, discount_amount = calculate_discounted_price(
                original_amount, active_disc.discount_percentage
            )
            promo_code_db_id = active_disc.promo_code_id

    idempotency_key = str(uuid.uuid4())

    payment_data: dict = {
        "user_id": user_id,
        "amount": final_amount,
        "original_amount": original_amount if discount_amount else None,
        "discount_applied": discount_amount,
        "currency": "RUB",
        "status": "pending",
        "description": description,
        "subscription_duration_months": months_for_legacy,
        "provider": provider,
        "idempotence_key": idempotency_key,
        "promo_code_id": promo_code_db_id,
        "pricing_plan_id": pricing_plan_id,
        "pricing_plan_option_id": pricing_plan_option_id_val,
        "sale_mode": sale_mode,
        "duration_months": duration_months_val,
        "duration_days": duration_days_val,
        "auto_renew_bundle_snapshot": bundle_snapshot_json,
    }

    payment = await payment_dal.create_payment_record(db, payment_data)
    payment_db_id = payment.payment_id

    return_url = (
        f"{settings.WEB_FRONTEND_URL.rstrip('/')}/payment/{payment_db_id}"
    )

    try:
        if provider == "yookassa":
            provider_id, redirect_url = await _create_yookassa_payment(
                settings,
                payment_db_id=payment_db_id,
                user_id=user_id,
                months=months_for_legacy,
                amount=final_amount,
                description=description,
                return_url=return_url,
                idempotency_key=idempotency_key,
            )
        elif provider == "platega":
            provider_id, redirect_url = await _create_platega_payment(
                settings,
                payment_db_id=payment_db_id,
                amount=final_amount,
                description=description,
                return_url=return_url,
            )
        elif provider == "freekassa":
            provider_id, redirect_url = _create_freekassa_url(
                settings,
                payment_db_id=payment_db_id,
                amount=final_amount,
                return_url=return_url,
            )
        elif provider == "severpay":
            provider_id, redirect_url = await _create_severpay_payment(
                settings,
                payment_db_id=payment_db_id,
                user_id=user_id,
                amount=final_amount,
                return_url=return_url,
            )
        elif provider == "cryptopay":
            provider_id, redirect_url = await _create_cryptopay_invoice(
                settings,
                payment_db_id=payment_db_id,
                user_id=user_id,
                months=months_for_legacy or 0,
                amount=final_amount,
                description=description,
                return_url=return_url,
            )
        else:
            raise ValueError(f"Провайдер '{provider}' не реализован")
    except Exception:
        await payment_dal.update_payment_status_by_db_id(db, payment_db_id, "failed")
        raise

    await payment_dal.update_provider_payment_and_status(
        db, payment_db_id, provider_id, "pending", redirect_url=redirect_url
    )

    return payment_db_id, redirect_url
