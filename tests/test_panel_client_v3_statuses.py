import pytest

from core.services.panel_client import PanelApiService


class FakeSettings:
    PANEL_API_URL = "http://panel.local/api"
    PANEL_API_KEY = "k"
    LOG_LEVEL = "INFO"
    USER_HWID_DEVICE_LIMIT = None


def make_panel(monkeypatch, reply):
    svc = PanelApiService(FakeSettings())
    calls = []

    async def fake_request(method, endpoint, **kwargs):
        calls.append({"method": method, "endpoint": endpoint, **kwargs})
        return reply

    monkeypatch.setattr(svc, "_request", fake_request)
    svc.calls = calls
    return svc


# Так _request возвращает пустое 202/204: тела нет, ошибки нет.
EMPTY_ACCEPTED = {"status": "success", "code": 202, "data_text": ""}


@pytest.mark.asyncio
async def test_restart_node_treats_202_without_body_as_success(monkeypatch):
    panel = make_panel(monkeypatch, EMPTY_ACCEPTED)
    assert await panel.restart_node("node-uuid") is True
    assert panel.calls[0]["endpoint"] == "/nodes/node-uuid/actions/restart"
    assert panel.calls[0]["json"] == {"forceRestart": False}


@pytest.mark.asyncio
async def test_enable_and_disable_node_return_bool(monkeypatch):
    panel = make_panel(monkeypatch, {"response": {"uuid": "n", "isDisabled": False}})
    assert await panel.enable_node("n") is True
    assert await panel.disable_node("n") is True
    assert panel.calls[0]["endpoint"] == "/nodes/n/actions/enable"
    assert panel.calls[1]["endpoint"] == "/nodes/n/actions/disable"


@pytest.mark.asyncio
async def test_node_action_reports_failure(monkeypatch):
    panel = make_panel(monkeypatch, {"error": True, "status_code": 500})
    assert await panel.restart_node("node-uuid") is False


@pytest.mark.asyncio
async def test_restart_all_nodes_accepts_202(monkeypatch):
    panel = make_panel(monkeypatch, EMPTY_ACCEPTED)
    assert await panel.restart_all_nodes() is True
    assert panel.calls[0]["endpoint"] == "/nodes/actions/restart-all"


@pytest.mark.asyncio
async def test_extend_uses_server_side_action(monkeypatch):
    panel = make_panel(monkeypatch, {"response": {"id": 42}})
    assert await panel.extend_user_subscription(42, 30) is True
    assert panel.calls[0]["endpoint"] == "/users/42/actions/extend"
    assert panel.calls[0]["json"] == {"days": 30}
    # Никакого read-modify-write: ровно один запрос.
    assert len(panel.calls) == 1


@pytest.mark.asyncio
async def test_extend_reports_failure(monkeypatch):
    panel = make_panel(monkeypatch, {"error": True, "status_code": 404})
    assert await panel.extend_user_subscription(42, 30) is False
