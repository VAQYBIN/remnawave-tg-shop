from bot.services.panel_api_service import PanelApiService as BotClient
from core.services.panel_client import PanelApiService as CoreClient


def test_bot_client_is_the_core_client():
    assert BotClient is CoreClient


def test_bot_module_defines_no_own_class():
    assert BotClient.__module__ == "core.services.panel_client"
