"""Рендер писем об истечении подписки: тексты, языки, плюрализация."""
import pytest

from core.services.notification_email_service import (
    KIND_EXPIRED,
    KIND_EXPIRED_YESTERDAY,
    KIND_PRE_EXPIRY,
    render_expiry_email,
)

COMMON = dict(
    brand="TestVPN",
    end_date="2026-07-14",
    renew_url="https://app.test/subscription",
    unsubscribe_url="https://api.test/api/profile/unsubscribe?token=x",
)


def test_pre_expiry_ru_contains_days_date_and_links():
    subject, html = render_expiry_email(
        kind=KIND_PRE_EXPIRY, days_left=3, lang="ru", **COMMON
    )
    assert "3 дня" in subject
    assert "TestVPN" in subject
    assert "3 дня" in html
    assert "2026-07-14" in html
    assert "https://app.test/subscription" in html
    assert "https://api.test/api/profile/unsubscribe?token=x" in html


@pytest.mark.parametrize(
    "days,phrase",
    [(1, "1 день"), (2, "2 дня"), (3, "3 дня"), (5, "5 дней"), (21, "21 день")],
)
def test_ru_days_pluralization(days, phrase):
    subject, _ = render_expiry_email(
        kind=KIND_PRE_EXPIRY, days_left=days, lang="ru", **COMMON
    )
    assert phrase in subject


def test_pre_expiry_en_singular_and_plural():
    subject_1, _ = render_expiry_email(
        kind=KIND_PRE_EXPIRY, days_left=1, lang="en", **COMMON
    )
    subject_2, _ = render_expiry_email(
        kind=KIND_PRE_EXPIRY, days_left=2, lang="en", **COMMON
    )
    assert "1 day" in subject_1
    assert "1 days" not in subject_1
    assert "2 days" in subject_2


def test_expired_ru():
    subject, html = render_expiry_email(
        kind=KIND_EXPIRED, days_left=0, lang="ru", **COMMON
    )
    assert "истекла" in subject
    assert "2026-07-14" in html


def test_expired_yesterday_ru():
    subject, html = render_expiry_email(
        kind=KIND_EXPIRED_YESTERDAY, days_left=0, lang="ru", **COMMON
    )
    assert "вчера" in subject
    assert "2026-07-14" in html


def test_unknown_lang_falls_back_to_ru():
    subject, _ = render_expiry_email(
        kind=KIND_EXPIRED, days_left=0, lang="de", **COMMON
    )
    assert "истекла" in subject


def test_no_unsubscribe_link_when_url_missing():
    _, html = render_expiry_email(
        kind=KIND_EXPIRED,
        days_left=0,
        lang="ru",
        brand="TestVPN",
        end_date="2026-07-14",
        renew_url="https://app.test/subscription",
        unsubscribe_url=None,
    )
    assert "Отписаться" not in html


def test_unknown_kind_raises():
    with pytest.raises(ValueError):
        render_expiry_email(kind="bogus", days_left=0, lang="ru", **COMMON)
