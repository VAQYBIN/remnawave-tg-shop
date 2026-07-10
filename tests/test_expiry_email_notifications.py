"""Email-канал уведомлений об истечении подписки."""
import uuid
from types import SimpleNamespace

import pytest


def test_account_email_notifications_column_defaults():
    from db.models import Account

    col = Account.__table__.c.email_notifications_enabled
    assert col.nullable is False
    assert col.default.arg is True
    assert col.server_default is not None
