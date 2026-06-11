"""Helpers for the Remnawave Subscription Page app config (v2 format).

The config is normally pulled live from the panel (drives the Devices/Guide tabs).
An optional offline override can be read from a mounted file.

The v2 raw config is ``{ version, locales, brandingSettings, uiConfig, baseSettings,
baseTranslations, svgLibrary, platforms }`` where ``platforms`` maps each platform
key to ``{ displayName, svgIconKey, apps: [...] }``. We return it to the frontend
as-is and only validate that it looks like a v2 config.
"""
import json
import logging
from typing import Any, Optional


def is_valid_v2_config(obj: Any) -> bool:
    """True when obj looks like a v2 subscription-page config with platforms."""
    return (
        isinstance(obj, dict)
        and isinstance(obj.get("platforms"), dict)
        and len(obj["platforms"]) > 0
    )


def load_app_config(path: str) -> Optional[dict]:
    """Read and parse an app-config-v2.json file (offline override). Returns dict or None."""
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        logging.info("Subscription page config file not found at %s", path)
        return None
    except (OSError, json.JSONDecodeError) as exc:
        logging.warning("Failed to read subscription page config %s: %s", path, exc)
        return None

    if not is_valid_v2_config(data):
        logging.warning(
            "Subscription page config at %s is not a valid v2 config (no platforms).", path
        )
        return None
    return data
