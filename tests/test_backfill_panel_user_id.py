from types import SimpleNamespace

import pytest

from scripts.backfill_panel_user_id import BackfillReport, backfill


class FakeSession:
    def __init__(self, users):
        self._users = users
        self.committed = 0

    async def execute(self, _stmt):
        rows = self._users

        class Result:
            def scalars(self_inner):
                class Scalars:
                    def all(self_inner2):
                        return rows

                return Scalars()

        return Result()

    async def commit(self):
        self.committed += 1


def make_user(user_id, panel_user_id=None):
    return SimpleNamespace(user_id=user_id, panel_user_id=panel_user_id)


class FakePanel:
    def __init__(self, mapping):
        self.mapping = mapping

    async def get_users_by_filter(self, telegram_id=None, username=None,
                                  email=None, log_response=True):
        if username in self.mapping:
            return [{"id": self.mapping[username]}]
        return []


@pytest.fixture(autouse=True)
def no_db_writes(monkeypatch):
    async def fake_update_user(session, user_id, payload):
        return None

    monkeypatch.setattr(
        "core.services.panel_identity.user_dal.update_user", fake_update_user
    )


@pytest.mark.asyncio
async def test_resolves_pending_users():
    users = [make_user(1), make_user(2)]
    panel = FakePanel({"tg_1": 11, "tg_2": 22})

    report = await backfill(FakeSession(users), panel, batch_pause=0)

    assert report == BackfillReport(resolved=2, not_found=0, skipped=0)
    assert users[0].panel_user_id == 11
    assert users[1].panel_user_id == 22


@pytest.mark.asyncio
async def test_counts_users_absent_from_panel():
    users = [make_user(1), make_user(2)]
    panel = FakePanel({"tg_1": 11})

    report = await backfill(FakeSession(users), panel, batch_pause=0)

    assert report == BackfillReport(resolved=1, not_found=1, skipped=0)


@pytest.mark.asyncio
async def test_is_idempotent_for_already_migrated_users():
    users = [make_user(1, panel_user_id=11)]
    panel = FakePanel({})

    report = await backfill(FakeSession(users), panel, batch_pause=0)

    assert report == BackfillReport(resolved=0, not_found=0, skipped=1)


@pytest.mark.asyncio
async def test_commits_once_at_the_end():
    session = FakeSession([make_user(1), make_user(2)])
    await backfill(session, FakePanel({"tg_1": 11, "tg_2": 22}), batch_pause=0)
    assert session.committed == 1
