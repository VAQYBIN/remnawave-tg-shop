"""
Tariff pricing utilities: prorating addon prices, min-price floors, Stars rounding.
"""
import math
from datetime import datetime, timezone
from typing import Optional, Tuple


def option_base_seconds(duration_months: Optional[int], duration_days: Optional[int], now: datetime) -> float:
    """Return full-period duration in seconds for a plan option."""
    if duration_days is not None:
        return float(duration_days * 86400)
    if duration_months is not None:
        # Average month = 30.4375 days (365.25 / 12)
        return float(duration_months * 30.4375 * 86400)
    return 30.0 * 86400


def prorate_option(
    *,
    price_rub: Optional[float],
    price_stars: Optional[int],
    duration_months: Optional[int],
    duration_days: Optional[int],
    plan_min_price_rub: Optional[float],
    plan_min_price_stars: Optional[int],
    standalone_ends_at: datetime,
    now: Optional[datetime] = None,
    global_min_rub: Optional[float] = None,
    global_min_stars: Optional[int] = None,
) -> Tuple[Optional[float], Optional[int]]:
    """
    Calculate prorated price for an addon option.
    Returns (prorated_price_rub, prorated_price_stars).
    Both can be None if the original option has no price.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    base_secs = option_base_seconds(duration_months, duration_days, now)
    remaining_secs = max(0.0, (standalone_ends_at - now).total_seconds())
    ratio = (remaining_secs / base_secs) if base_secs > 0 else 0.0

    prorated_rub: Optional[float] = None
    prorated_stars: Optional[int] = None

    if price_rub is not None:
        raw = price_rub * ratio
        min_rub = plan_min_price_rub if plan_min_price_rub is not None else global_min_rub
        if min_rub is not None:
            raw = max(raw, min_rub)
        prorated_rub = round(raw, 2)

    if price_stars is not None:
        raw_stars = float(price_stars) * ratio
        min_stars_val = float(plan_min_price_stars) if plan_min_price_stars is not None else (
            float(global_min_stars) if global_min_stars is not None else None
        )
        if min_stars_val is not None:
            raw_stars = max(raw_stars, min_stars_val)
        prorated_stars = math.ceil(raw_stars)

    return prorated_rub, prorated_stars
