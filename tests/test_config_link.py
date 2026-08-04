import pytest

from bot.utils.config_link import prepare_config_links


class FakeSettings:
    pass


@pytest.mark.asyncio
async def test_returns_raw_link_for_both_slots():
    display, button = await prepare_config_links(FakeSettings(), "  https://p.io/sub/abc  ")
    assert display == "https://p.io/sub/abc"
    assert button == "https://p.io/sub/abc"


@pytest.mark.asyncio
async def test_empty_input_returns_nones():
    assert await prepare_config_links(FakeSettings(), None) == (None, None)
    assert await prepare_config_links(FakeSettings(), "   ") == (None, None)


def test_panel_client_has_no_happ_encryption():
    from core.services.panel_client import PanelApiService

    assert not hasattr(PanelApiService, "encrypt_happ_link")
