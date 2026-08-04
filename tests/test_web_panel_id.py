import inspect

import web.routers.admin.users as admin_users_router
import web.routers.devices as devices_router
import web.routers.subscription as subscription_router
from web.schemas.subscription import SubscriptionResponse

MODULES = (subscription_router, devices_router, admin_users_router)


def test_subscription_schema_exposes_panel_user_id():
    assert "panel_user_id" in SubscriptionResponse.model_fields
    assert "panel_user_uuid" not in SubscriptionResponse.model_fields


def test_subscription_router_no_longer_builds_panel_urls_by_hand():
    source = inspect.getsource(subscription_router)
    assert "PANEL_API_URL.rstrip" not in source


def test_no_web_router_reads_panel_user_uuid():
    for module in MODULES:
        source = inspect.getsource(module)
        assert "panel_user_uuid" not in source, module.__name__


def test_no_web_router_calls_removed_client_methods():
    for module in MODULES:
        source = inspect.getsource(module)
        assert "get_user_by_uuid" not in source, module.__name__
        assert '"subscriptionUuid"' not in source, module.__name__
