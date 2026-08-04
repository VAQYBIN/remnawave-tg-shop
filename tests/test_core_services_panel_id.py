import inspect

from core.services import (
    account_linking,
    subscription_core,
    tariff_cleanup,
    tariff_sync,
    trial_core,
)


def test_subscription_core_exposes_panel_id_getter():
    assert hasattr(subscription_core, "get_user_panel_id")
    assert not hasattr(subscription_core, "get_user_panel_uuid")


def test_tariff_sync_takes_panel_user_id():
    sig = inspect.signature(tariff_sync.sync_entitlements_to_panel)
    assert "panel_user_id" in sig.parameters
    assert "panel_user_uuid" not in sig.parameters


def test_no_core_service_reads_panel_user_uuid():
    for module in (
        subscription_core,
        account_linking,
        tariff_sync,
        tariff_cleanup,
        trial_core,
    ):
        source = inspect.getsource(module)
        assert "panel_user_uuid" not in source, module.__name__


def test_no_core_service_calls_removed_client_methods():
    for module in (
        subscription_core,
        account_linking,
        tariff_sync,
        tariff_cleanup,
        trial_core,
    ):
        source = inspect.getsource(module)
        assert "get_user_by_uuid" not in source, module.__name__
        # subscriptionUuid удалён из объекта пользователя в v3, остался shortUuid.
        # Ищем обращение к полю, а не упоминание в комментарии.
        assert '"subscriptionUuid"' not in source, module.__name__
