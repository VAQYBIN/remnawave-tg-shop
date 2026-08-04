from sqlalchemy import BigInteger

from db.models import Subscription, User


def test_user_has_panel_user_id_column():
    col = User.__table__.columns["panel_user_id"]
    assert isinstance(col.type, BigInteger)
    assert col.nullable is True
    assert col.unique is True


def test_subscription_has_panel_user_id_column():
    col = Subscription.__table__.columns["panel_user_id"]
    assert isinstance(col.type, BigInteger)
    assert col.nullable is True
    assert col.index is True


def test_subscription_panel_user_uuid_is_now_nullable():
    # После cutover новые подписки заводятся без панельного uuid.
    assert Subscription.__table__.columns["panel_user_uuid"].nullable is True
