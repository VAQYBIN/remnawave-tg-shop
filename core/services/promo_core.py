"""
Promo code core service — pure business logic extracted from bot/services/promo_code_service.py.
No Aiogram/Bot/i18n dependencies.
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Tuple

from core.dal import promo_code_dal, active_discount_dal, payment_dal


def calculate_discounted_price(
    original_price: float,
    discount_percentage: int,
) -> Tuple[float, float]:
    """
    Calculate discounted price and discount amount.
    Returns: (final_price, discount_amount)
    """
    discount_amount = round(original_price * (discount_percentage / 100), 2)
    final_price = round(original_price - discount_amount, 2)

    # Ensure price doesn't go negative
    if final_price < 0:
        final_price = 0
        discount_amount = original_price

    return final_price, discount_amount


async def get_user_active_discount(
    session: AsyncSession,
    user_id: int,
) -> Optional[Tuple[int, str]]:
    """
    Get user's active discount if any.
    Returns: (discount_percentage, promo_code) or None
    """
    active_discount = await active_discount_dal.get_active_discount(
        session,
        user_id,
        include_expired=True,
    )
    if not active_discount:
        return None

    now_utc = datetime.now(timezone.utc)
    if active_discount.expires_at <= now_utc:
        cleared = await active_discount_dal.clear_active_discount_if_expired(
            session,
            user_id,
            now=now_utc,
        )
        if cleared:
            await promo_code_dal.decrement_promo_code_usage(
                session,
                active_discount.promo_code_id,
            )
        return None

    # Fetch promo code for code string
    promo = await promo_code_dal.get_promo_code_by_id(
        session, active_discount.promo_code_id
    )
    if not promo:
        # Discount exists but promo not found - clear it
        await active_discount_dal.clear_active_discount(session, user_id)
        return None

    # Check if promo code has expired
    if promo.valid_until and promo.valid_until <= datetime.now(timezone.utc):
        logging.info(
            f"Promo code {promo.code} expired (valid_until: {promo.valid_until}). "
            f"Clearing active discount for user {user_id}"
        )
        cleared = await active_discount_dal.clear_active_discount(session, user_id)
        if cleared:
            await promo_code_dal.decrement_promo_code_usage(session, promo.promo_code_id)
        return None

    return (active_discount.discount_percentage, promo.code)


async def consume_discount(
    session: AsyncSession,
    user_id: int,
    payment_id: int,
) -> bool:
    """
    Consume discount after successful payment.

    The payment record is the source of truth. Even if the active reservation was
    concurrently expired/cleared, we still record promo activation and reconcile
    current_activations so successful discounted payments are always accounted for.
    """
    payment_record = await payment_dal.get_payment_by_db_id(session, payment_id)
    if not payment_record:
        logging.warning(
            "Payment %s not found for discount consumption (user %s).",
            payment_id,
            user_id,
        )
        return False

    if not payment_record.discount_applied:
        return False

    promo_code_id = payment_record.promo_code_id
    if not promo_code_id:
        logging.warning(
            "Payment %s for user %s has discount_applied but no promo_code_id.",
            payment_id,
            user_id,
        )
        return False

    existing_activation = await promo_code_dal.get_user_activation_for_promo(
        session, promo_code_id, user_id
    )

    activation_created = False
    if existing_activation:
        if existing_activation.payment_id is None:
            updated_payment = await promo_code_dal.set_activation_payment_id(
                session, promo_code_id, user_id, payment_id
            )
            if updated_payment:
                logging.info(
                    "Linked discount promo %s activation to payment %s for user %s.",
                    promo_code_id,
                    payment_id,
                    user_id,
                )
    else:
        activation_recorded = await promo_code_dal.record_promo_activation(
            session,
            promo_code_id,
            user_id,
            payment_id=payment_id,
        )
        if not activation_recorded:
            logging.error(
                "Failed to record discount activation for user %s, promo %s.",
                user_id,
                promo_code_id,
            )
            return False
        activation_created = True

    active_discount = await active_discount_dal.get_active_discount(
        session,
        user_id,
        include_expired=True,
    )

    # Reservation is best-effort cleanup at this point; payment success already happened.
    if active_discount and active_discount.promo_code_id == promo_code_id:
        await active_discount_dal.clear_active_discount_if_matches(
            session,
            user_id=user_id,
            promo_code_id=promo_code_id,
        )
    elif active_discount and active_discount.promo_code_id != promo_code_id:
        logging.info(
            "Active discount promo %s differs from payment promo %s during consumption.",
            active_discount.promo_code_id,
            promo_code_id,
        )
    else:
        logging.info(
            "Discount reservation already absent at consumption time (user=%s, promo=%s, payment=%s)",
            user_id,
            promo_code_id,
            payment_id,
        )

    # If reservation was already expired/removed and we had to create activation now,
    # restore current_activations to match the successful payment.
    if activation_created:
        await promo_code_dal.increment_promo_code_usage(
            session,
            promo_code_id,
            allow_overflow=True,
        )

    await session.flush()
    logging.info(
        "Discount consumed for user %s, promo %s, payment %s",
        user_id,
        promo_code_id,
        payment_id,
    )
    return True


async def validate_bonus_promo_code(
    session: AsyncSession,
    user_id: int,
    code_input: str,
) -> Tuple[bool, Optional[object], Optional[str]]:
    """
    Validate a bonus_days promo code for a user.
    Returns: (is_valid, promo_code_obj_or_None, error_reason_or_None)
    """
    code_input_upper = code_input.strip().upper()

    promo_data = await promo_code_dal.get_active_bonus_promo_code_by_code_str(
        session, code_input_upper)

    if not promo_data:
        return False, None, "promo_code_not_found"

    existing_activation = await promo_code_dal.get_user_activation_for_promo(
        session, promo_data.promo_code_id, user_id)
    if existing_activation:
        return False, None, "promo_code_already_used_by_user"

    return True, promo_data, None


async def validate_discount_promo_code(
    session: AsyncSession,
    user_id: int,
    code_input: str,
    discount_payment_timeout_minutes: int = 10,
) -> Tuple[bool, Optional[int], Optional[str]]:
    """
    Validate and reserve a discount promo code for a user.
    Returns: (is_valid, discount_percentage_or_None, error_reason_or_None)
    """
    code_input_upper = code_input.strip().upper()

    # Check if user already has an active discount
    existing_discount = await active_discount_dal.get_active_discount(
        session,
        user_id,
        include_expired=True,
    )
    if existing_discount:
        now_utc = datetime.now(timezone.utc)
        if existing_discount.expires_at <= now_utc:
            cleared = await active_discount_dal.clear_active_discount_if_expired(
                session,
                user_id,
                now=now_utc,
            )
            if cleared:
                await promo_code_dal.decrement_promo_code_usage(
                    session,
                    existing_discount.promo_code_id,
                )
            existing_discount = None

    if existing_discount:
        existing_promo = await promo_code_dal.get_promo_code_by_id(
            session, existing_discount.promo_code_id
        )
        if existing_promo:
            return False, None, "discount_promo_already_active"
        else:
            await active_discount_dal.clear_active_discount(session, user_id)

    # Get discount promo code
    promo_data = await promo_code_dal.get_active_discount_promo_code_by_code_str(
        session, code_input_upper
    )

    if not promo_data:
        return False, None, "promo_code_not_found_or_not_discount"

    # Check if user already used this code
    existing_activation = await promo_code_dal.get_user_activation_for_promo(
        session, promo_data.promo_code_id, user_id
    )
    if existing_activation:
        return False, None, "promo_code_already_used_by_user"

    # Reserve discount
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=discount_payment_timeout_minutes,
    )
    active_discount = await active_discount_dal.set_active_discount(
        session,
        user_id=user_id,
        promo_code_id=promo_data.promo_code_id,
        discount_percentage=promo_data.discount_percentage,
        expires_at=expires_at,
    )

    if not active_discount:
        return False, None, "error_applying_promo_discount"

    promo_incremented = await promo_code_dal.increment_promo_code_usage(
        session,
        promo_data.promo_code_id,
    )
    if not promo_incremented:
        await active_discount_dal.clear_active_discount_if_matches(
            session,
            user_id=user_id,
            promo_code_id=promo_data.promo_code_id,
        )
        return False, None, "promo_code_not_found_or_not_discount"

    logging.info(
        f"Discount promo code {code_input_upper} activated for user {user_id}: "
        f"{promo_data.discount_percentage}% off until {expires_at.isoformat()}"
    )
    return True, promo_data.discount_percentage, None
