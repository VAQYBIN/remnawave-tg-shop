import pytest

from core.services.panel_client import PanelApiService


class FakeSettings:
    PANEL_API_URL = "http://panel.local/api"
    PANEL_API_KEY = "k"
    LOG_LEVEL = "INFO"
    USER_HWID_DEVICE_LIMIT = None


@pytest.fixture
def panel(monkeypatch):
    svc = PanelApiService(FakeSettings())
    calls = []

    async def fake_request(method, endpoint, **kwargs):
        calls.append({"method": method, "endpoint": endpoint, **kwargs})
        return {"response": {"id": 42, "status": "ACTIVE", "trafficLimitBytes": 100}}

    monkeypatch.setattr(svc, "_request", fake_request)
    svc.calls = calls
    return svc


@pytest.mark.asyncio
async def test_get_user_by_id_uses_numeric_path(panel):
    await panel.get_user_by_id(42)
    assert panel.calls[0]["endpoint"] == "/users/42"


@pytest.mark.asyncio
async def test_lookup_by_telegram_id_uses_stream(panel):
    await panel.get_users_by_filter(telegram_id=777)
    assert panel.calls[0]["endpoint"] == "/users/stream"
    assert panel.calls[0]["params"] == {"telegramId": "777"}


@pytest.mark.asyncio
async def test_lookup_by_email_uses_stream(panel):
    await panel.get_users_by_filter(email="a@b.io")
    assert panel.calls[0]["endpoint"] == "/users/stream"
    assert panel.calls[0]["params"] == {"email": "a@b.io"}


@pytest.mark.asyncio
async def test_lookup_by_username_keeps_dedicated_endpoint(panel):
    result = await panel.get_users_by_filter(username="tg_5")
    assert panel.calls[0]["endpoint"] == "/users/by-username/tg_5"
    assert result == [{"id": 42, "status": "ACTIVE", "trafficLimitBytes": 100}]


@pytest.mark.asyncio
async def test_patch_identifies_user_by_numeric_id(panel):
    await panel.update_user_details_on_panel(42, {"uuid": "stale", "expireAt": "x"})
    body = panel.calls[0]["json"]
    assert body["id"] == 42
    assert "uuid" not in body


@pytest.mark.asyncio
async def test_patch_does_not_mutate_the_callers_payload(panel):
    payload = {"expireAt": "x"}
    await panel.update_user_details_on_panel(42, payload)
    assert payload == {"expireAt": "x"}


@pytest.mark.asyncio
async def test_status_action_uses_numeric_path(panel):
    await panel.update_user_status_on_panel(42, enable=True)
    assert panel.calls[0]["endpoint"] == "/users/42/actions/enable"


@pytest.mark.asyncio
async def test_reset_traffic_uses_numeric_path(panel):
    await panel.reset_user_traffic_on_panel(42)
    assert panel.calls[0]["endpoint"] == "/users/42/actions/reset-traffic"


@pytest.mark.asyncio
async def test_disconnect_device_sends_user_id(panel):
    await panel.disconnect_device(42, "HW-1")
    assert panel.calls[0]["endpoint"] == "/hwid/devices/delete"
    assert panel.calls[0]["json"] == {"userId": 42, "hwid": "HW-1"}


@pytest.mark.asyncio
async def test_get_user_devices_uses_numeric_path(panel):
    await panel.get_user_devices(42)
    assert panel.calls[0]["endpoint"] == "/hwid/devices/42"


@pytest.mark.asyncio
async def test_delete_user_uses_numeric_path(panel):
    await panel.delete_user_from_panel(42)
    assert panel.calls[0]["method"] == "DELETE"
    assert panel.calls[0]["endpoint"] == "/users/42"


@pytest.mark.asyncio
async def test_delete_treats_empty_204_body_as_success(monkeypatch):
    svc = PanelApiService(FakeSettings())

    async def fake_request(method, endpoint, **kwargs):
        # Так _request отдаёт 204 No Content: тела нет, ошибки нет.
        return {"status": "success", "code": 204, "data_text": ""}

    monkeypatch.setattr(svc, "_request", fake_request)
    assert await svc.delete_user_from_panel(42) is True


@pytest.mark.asyncio
async def test_stream_lookup_reads_nested_users_list(monkeypatch):
    svc = PanelApiService(FakeSettings())

    async def fake_request(method, endpoint, **kwargs):
        return {"response": {"users": [{"id": 7}], "total": 1}}

    monkeypatch.setattr(svc, "_request", fake_request)
    assert await svc.get_users_by_filter(telegram_id=1) == [{"id": 7}]
