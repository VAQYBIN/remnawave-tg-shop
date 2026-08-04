import inspect

import pytest

from core.dal import subscription_dal


def test_active_subscription_lookup_takes_panel_user_id():
    sig = inspect.signature(subscription_dal.get_active_subscription_by_user_id)
    assert "panel_user_id" in sig.parameters
    assert "panel_user_uuid" not in sig.parameters


def test_deactivate_others_takes_panel_user_id():
    sig = inspect.signature(subscription_dal.deactivate_other_active_subscriptions)
    assert "panel_user_id" in sig.parameters
    assert "panel_user_uuid" not in sig.parameters


class SessionWithoutMatches:
    """Сессия, в которой подписки с таким panel_subscription_uuid ещё нет."""

    async def execute(self, _stmt):
        class Result:
            def scalar_one_or_none(self):
                return None

        return Result()


@pytest.mark.asyncio
async def test_upsert_requires_panel_user_id_when_user_id_missing():
    with pytest.raises(ValueError, match="panel_user_id"):
        await subscription_dal.upsert_subscription(
            SessionWithoutMatches(),
            {"panel_subscription_uuid": "short-1", "end_date": "2030-01-01"},
        )


def test_module_no_longer_reads_panel_user_uuid():
    source = inspect.getsource(subscription_dal)
    assert "panel_user_uuid" not in source
