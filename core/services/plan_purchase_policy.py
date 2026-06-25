"""Единое правило: можно ли пользователю купить данный option тарифа.

Кодируем правило бизнесово: archived можно купить только как продление
собственной активной standalone-подписки на тот же план.
"""
from datetime import datetime, timezone
from typing import Iterable, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from db.models import PricingPlanOption


PurchaseDecision = Tuple[bool, Optional[str]]


REASON_OPTION_DISABLED = "option_disabled"
REASON_PLAN_DISABLED = "plan_disabled"
REASON_PLAN_ARCHIVED_NO_RENEWAL = "plan_archived_no_renewal"
REASON_PLAN_ARCHIVED_ADDON = "plan_archived_addon"
REASON_PLAN_ARCHIVED_OTHER_PLAN = "plan_archived_other_plan"


async def can_purchase_plan_option(
    session: AsyncSession,
    user_ids: Iterable[int],
    option: PricingPlanOption,
    *,
    now: Optional[datetime] = None,
) -> PurchaseDecision:
    """Return (allowed, reason_key).

    Allowed when:
      - option и план активны, план не архивный, либо
      - план архивный, kind=standalone, и хотя бы у одного user_id есть
        активный standalone-entitlement на ТОТ ЖЕ план (renewal).

    Archived addon-планы продлевать нельзя: addon живёт до окончания
    standalone, отдельной "своей" подписки на него нет.
    """
    if not option.is_enabled:
        return False, REASON_OPTION_DISABLED

    plan = option.plan
    if plan is None:
        return False, REASON_PLAN_DISABLED

    if not plan.is_archived:
        if not plan.is_enabled:
            return False, REASON_PLAN_DISABLED
        return True, None

    # Архивный: is_enabled принудительно False, но продление допустимо
    if plan.plan_kind != "standalone":
        return False, REASON_PLAN_ARCHIVED_ADDON

    from core.dal.plan_entitlement_dal import get_active_standalone_entitlement

    now = now or datetime.now(timezone.utc)
    for user_id in user_ids:
        ent = await get_active_standalone_entitlement(session, user_id, now=now)
        if ent and ent.plan_id == plan.id:
            if ent.ends_at is None or ent.ends_at > now:
                return True, None

    return False, REASON_PLAN_ARCHIVED_NO_RENEWAL
