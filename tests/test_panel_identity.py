from types import SimpleNamespace

import pytest

from core.services.panel_identity import panel_username_for, resolve_panel_user_id


def make_user(user_id, panel_user_id=None):
    return SimpleNamespace(user_id=user_id, panel_user_id=panel_user_id)


class FakePanel:
    def __init__(self, by_username=None, by_telegram=None):
        self._by_username = by_username
        self._by_telegram = by_telegram
        self.calls = []

    async def get_users_by_filter(self, telegram_id=None, username=None,
                                  email=None, log_response=True):
        self.calls.append({"telegram_id": telegram_id, "username": username})
        if username is not None:
            return self._by_username
        if telegram_id is not None:
            return self._by_telegram
        return []


@pytest.fixture
def captured_updates(monkeypatch):
    updates = []

    async def fake_update_user(session, user_id, payload):
        updates.append((user_id, payload))

    monkeypatch.setattr(
        "core.services.panel_identity.user_dal.update_user", fake_update_user
    )
    return updates


def test_username_for_telegram_user():
    assert panel_username_for(make_user(12345), None) == "tg_12345"


def test_username_for_web_user_without_account():
    assert panel_username_for(make_user(-9000000000001), None) == "web_9000000000001"


@pytest.mark.asyncio
async def test_returns_stored_id_without_touching_panel(captured_updates):
    panel = FakePanel()
    user = make_user(12345, panel_user_id=42)

    assert await resolve_panel_user_id(None, panel, user) == 42
    assert panel.calls == []
    assert captured_updates == []


@pytest.mark.asyncio
async def test_resolves_by_username_and_persists(captured_updates):
    panel = FakePanel(by_username=[{"id": 42, "username": "tg_12345"}])
    user = make_user(12345)

    assert await resolve_panel_user_id(None, panel, user) == 42
    assert panel.calls[0]["username"] == "tg_12345"
    assert captured_updates == [(12345, {"panel_user_id": 42})]
    assert user.panel_user_id == 42


@pytest.mark.asyncio
async def test_falls_back_to_telegram_id(captured_updates):
    panel = FakePanel(by_username=[], by_telegram=[{"id": 77}])
    user = make_user(12345)

    assert await resolve_panel_user_id(None, panel, user) == 77
    assert captured_updates == [(12345, {"panel_user_id": 77})]


@pytest.mark.asyncio
async def test_web_user_never_falls_back_to_telegram_lookup(captured_updates):
    panel = FakePanel(by_username=[], by_telegram=[{"id": 99}])
    user = make_user(-9000000000001)

    assert await resolve_panel_user_id(None, panel, user) is None
    assert [c["telegram_id"] for c in panel.calls] == [None]


@pytest.mark.asyncio
async def test_returns_none_when_panel_has_no_such_user(captured_updates):
    panel = FakePanel(by_username=[], by_telegram=[])
    assert await resolve_panel_user_id(None, panel, make_user(12345)) is None
    assert captured_updates == []


@pytest.mark.asyncio
async def test_ambiguous_telegram_match_is_refused(captured_updates):
    panel = FakePanel(by_username=[], by_telegram=[{"id": 1}, {"id": 2}])
    assert await resolve_panel_user_id(None, panel, make_user(12345)) is None
    assert captured_updates == []


@pytest.mark.asyncio
async def test_panel_unavailable_is_not_mistaken_for_absence(captured_updates):
    # get_users_by_filter возвращает None при сетевой ошибке, [] когда юзера нет.
    panel = FakePanel(by_username=None, by_telegram=None)
    assert await resolve_panel_user_id(None, panel, make_user(12345)) is None
    assert captured_updates == []


@pytest.mark.asyncio
async def test_non_numeric_id_from_panel_is_ignored(captured_updates):
    panel = FakePanel(by_username=[{"id": "not-a-number"}], by_telegram=[])
    assert await resolve_panel_user_id(None, panel, make_user(12345)) is None
    assert captured_updates == []
