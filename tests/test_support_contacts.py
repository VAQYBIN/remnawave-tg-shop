"""Контакты поддержки: нормализация в схеме, очистка полей и .env-fallback."""
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import web.routers.config as config_router_module
from core.services.branding_theme import default_theme
from db.models import SiteSettings
from web.dependencies import get_db, get_settings_dep
from web.routers.admin.branding import build_branding_updates
from web.routers.config import router as config_router
from web.schemas.admin.branding import BrandingUpdateRequest


def make_site_settings(**overrides) -> SiteSettings:
    base = dict(
        id=1,
        brand_name="VPN",
        primary_color="#2AACDF",
        secondary_color="#897569",
        background_color="#F5F1ED",
        foreground_color="#2B2B2B",
        card_color="#FFFFFF",
        border_color="#DDD8D3",
        font_family="Nunito",
        theme_json=default_theme(),
        default_color_scheme="light",
        news_enabled=True,
        referral_enabled=True,
        devices_enabled=True,
        support_enabled=True,
        contact_support_tg_username=None,
        contact_support_email=None,
        contact_support_phone=None,
    )
    base.update(overrides)
    return SiteSettings(**base)


def make_env_settings(**overrides):
    base = dict(
        TERMS_OF_SERVICE_URL=None,
        PRIVACY_POLICY_URL=None,
        PERSONAL_DATA_URL=None,
        REFUND_POLICY_URL=None,
        CONTACT_SUPPORT_TG_USERNAME=None,
        CONTACT_SUPPORT_EMAIL=None,
        CONTACT_SUPPORT_PHONE=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── Схема: нормализация значений ─────────────────────────────────────────────
def test_blank_contact_becomes_none():
    body = BrandingUpdateRequest(contact_support_email="   ")
    assert body.contact_support_email is None


def test_tg_username_is_stripped_of_leading_at():
    body = BrandingUpdateRequest(contact_support_tg_username="  @support_bot ")
    assert body.contact_support_tg_username == "support_bot"


def test_tg_username_accepts_full_link():
    body = BrandingUpdateRequest(contact_support_tg_username="https://t.me/support_bot")
    assert body.contact_support_tg_username == "support_bot"


# ── Роутер: какие поля попадают в UPDATE ─────────────────────────────────────
def test_updates_contain_only_provided_fields():
    updates = build_branding_updates(BrandingUpdateRequest(contact_support_email="a@b.c"))
    assert updates == {"contact_support_email": "a@b.c"}


def test_blank_value_clears_stored_contact():
    """Пустая строка = «очистить поле», а не «не трогать» (иначе контакт не удалить)."""
    updates = build_branding_updates(BrandingUpdateRequest(contact_support_phone=""))
    assert updates == {"contact_support_phone": None}


def test_explicit_null_clears_legal_url():
    updates = build_branding_updates(BrandingUpdateRequest(refund_policy_url=None))
    assert updates == {"refund_policy_url": None}


def test_null_for_non_nullable_column_is_ignored():
    """brand_name NOT NULL — null от клиента не должен ронять UPDATE."""
    updates = build_branding_updates(BrandingUpdateRequest(brand_name=None))
    assert updates == {}


# ── Публичный /config/branding ───────────────────────────────────────────────
@pytest.fixture
def public_app(request):
    site, env = request.param
    app = FastAPI()
    app.include_router(config_router, prefix="/api")

    async def _override_get_db():
        yield None

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_settings_dep] = lambda: env
    app._test_site_settings = site
    return app


@pytest_asyncio.fixture
async def public_client(public_app, monkeypatch):
    async def _fake_get_site_settings(_db):
        return public_app._test_site_settings

    monkeypatch.setattr(config_router_module, "get_site_settings", _fake_get_site_settings)
    transport = ASGITransport(app=public_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.parametrize(
    "public_app",
    [(make_site_settings(), make_env_settings(
        CONTACT_SUPPORT_TG_USERNAME="env_support",
        CONTACT_SUPPORT_EMAIL="env@test.local",
        CONTACT_SUPPORT_PHONE="+7 000 000-00-00",
    ))],
    indirect=True,
)
@pytest.mark.asyncio
async def test_env_contacts_used_when_db_empty(public_client):
    resp = await public_client.get("/api/config/branding")
    assert resp.status_code == 200
    body = resp.json()
    assert body["contact_support_tg_username"] == "env_support"
    assert body["contact_support_email"] == "env@test.local"
    assert body["contact_support_phone"] == "+7 000 000-00-00"


@pytest.mark.parametrize(
    "public_app",
    [(
        make_site_settings(
            contact_support_tg_username="db_support",
            contact_support_email="db@test.local",
        ),
        make_env_settings(
            CONTACT_SUPPORT_TG_USERNAME="env_support",
            CONTACT_SUPPORT_EMAIL="env@test.local",
            CONTACT_SUPPORT_PHONE="+7 000 000-00-00",
        ),
    )],
    indirect=True,
)
@pytest.mark.asyncio
async def test_db_contacts_win_over_env(public_client):
    body = (await public_client.get("/api/config/branding")).json()
    assert body["contact_support_tg_username"] == "db_support"
    assert body["contact_support_email"] == "db@test.local"
    # телефон в БД не задан — подставляется из .env
    assert body["contact_support_phone"] == "+7 000 000-00-00"


@pytest.mark.parametrize(
    "public_app",
    [(make_site_settings(), make_env_settings())],
    indirect=True,
)
@pytest.mark.asyncio
async def test_contacts_absent_when_nothing_configured(public_client):
    body = (await public_client.get("/api/config/branding")).json()
    assert body["contact_support_tg_username"] is None
    assert body["contact_support_email"] is None
    assert body["contact_support_phone"] is None
