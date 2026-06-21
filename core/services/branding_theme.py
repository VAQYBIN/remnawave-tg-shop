"""Canonical branding theme model shared by web API, bot and DB seeding.

A *theme* is two colour palettes (``light`` + ``dark``) plus a ``radius``.
Every palette is a flat ``{token: "#rrggbb"}`` map keyed by the tokens in
:data:`TOKEN_KEYS`. The frontend turns each token into the matching
``--<token-with-dashes>`` CSS variable, so the whole UI re-themes by swapping
variable values at runtime — no per-component ``dark:`` classes required.

This module is the single source of truth for:
  * the list of editable tokens (:data:`TOKEN_KEYS`);
  * the default light/dark palettes (:data:`DEFAULT_LIGHT` / :data:`DEFAULT_DARK`);
  * built-in presets seeded into ``brand_themes`` (:data:`BUILTIN_THEMES`);
  * normalisation helpers that upgrade legacy single-palette ``site_settings``
    rows (the six flat ``*_color`` columns) into the new theme structure.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

# ── Tokens ──────────────────────────────────────────────────────────────────
# Order matters: it drives the admin UI grouping. Each token maps to the CSS
# custom property ``--<token replaced _ with ->`` (e.g. primary_foreground →
# --primary-foreground).
TOKEN_KEYS: List[str] = [
    # Surfaces & text
    "background",
    "foreground",
    "card",
    "card_foreground",
    "muted",
    "muted_foreground",
    "border",
    # Brand accents
    "primary",
    "primary_foreground",
    "secondary",
    "secondary_foreground",
    # Semantic
    "success",
    "success_bg",
    "warning",
    "warning_bg",
    "danger",
    "danger_bg",
    "info",
    "info_bg",
]

# Tokens that legacy `site_settings.*_color` columns map onto directly.
LEGACY_COLUMN_TO_TOKEN: Dict[str, str] = {
    "primary_color": "primary",
    "secondary_color": "secondary",
    "background_color": "background",
    "foreground_color": "foreground",
    "card_color": "card",
    "border_color": "border",
}

DEFAULT_RADIUS = "0.5rem"
DEFAULT_BODY_FONT = "Nunito"
DEFAULT_HEADING_FONT = "Nunito"
COLOR_SCHEMES = ("light", "dark", "system")
DEFAULT_COLOR_SCHEME = "light"

_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def is_hex_color(value: str) -> bool:
    return bool(isinstance(value, str) and _HEX_RE.match(value.strip()))


# ── Default palettes ────────────────────────────────────────────────────────
DEFAULT_LIGHT: Dict[str, str] = {
    "background": "#F5F1ED",
    "foreground": "#2B2B2B",
    "card": "#FFFFFF",
    "card_foreground": "#2B2B2B",
    "muted": "#ECE8E2",
    "muted_foreground": "#666666",
    "border": "#DDD8D3",
    "primary": "#2AACDF",
    "primary_foreground": "#FFFFFF",
    "secondary": "#897569",
    "secondary_foreground": "#FFFFFF",
    "success": "#1FAB6A",
    "success_bg": "#E4F6EC",
    "warning": "#D89221",
    "warning_bg": "#FBEFD6",
    "danger": "#DC4040",
    "danger_bg": "#FBE5E5",
    "info": "#2AACDF",
    "info_bg": "#E6F5FB",
}

DEFAULT_DARK: Dict[str, str] = {
    "background": "#17181D",
    "foreground": "#E8E8EA",
    "card": "#212229",
    "card_foreground": "#E8E8EA",
    "muted": "#2C2D35",
    "muted_foreground": "#9DA0AA",
    "border": "#373943",
    "primary": "#2AACDF",
    "primary_foreground": "#08222C",
    "secondary": "#A6907F",
    "secondary_foreground": "#1A1614",
    "success": "#34D399",
    "success_bg": "#0E2A1E",
    "warning": "#FBBF24",
    "warning_bg": "#33260A",
    "danger": "#F87171",
    "danger_bg": "#34161A",
    "info": "#38BDF8",
    "info_bg": "#0C2A3A",
}


def default_theme() -> Dict[str, Any]:
    return {
        "light": dict(DEFAULT_LIGHT),
        "dark": dict(DEFAULT_DARK),
        "radius": DEFAULT_RADIUS,
    }


# ── Normalisation ───────────────────────────────────────────────────────────
def _normalise_palette(raw: Any, fallback: Dict[str, str]) -> Dict[str, str]:
    """Return a palette containing exactly TOKEN_KEYS, filling gaps from fallback."""
    raw = raw if isinstance(raw, dict) else {}
    result: Dict[str, str] = {}
    for key in TOKEN_KEYS:
        value = raw.get(key)
        result[key] = value if is_hex_color(value) else fallback[key]
    return result


def normalise_theme(raw: Any) -> Dict[str, Any]:
    """Coerce arbitrary stored JSON into a complete, valid theme structure."""
    raw = raw if isinstance(raw, dict) else {}
    radius = raw.get("radius")
    return {
        "light": _normalise_palette(raw.get("light"), DEFAULT_LIGHT),
        "dark": _normalise_palette(raw.get("dark"), DEFAULT_DARK),
        "radius": radius if isinstance(radius, str) and radius.strip() else DEFAULT_RADIUS,
    }


def theme_from_legacy_columns(settings: Any) -> Dict[str, Any]:
    """Build a theme from the legacy flat ``*_color`` columns of a SiteSettings row.

    Only the light palette is reconstructable from legacy data; dark falls back
    to the bundled default dark palette so existing installs gain a sane dark mode.
    """
    light = dict(DEFAULT_LIGHT)
    for column, token in LEGACY_COLUMN_TO_TOKEN.items():
        value = getattr(settings, column, None)
        if is_hex_color(value):
            light[token] = value
    # Derive a couple of obvious foregrounds so legacy installs look right.
    light["card_foreground"] = light["foreground"]
    return {"light": light, "dark": dict(DEFAULT_DARK), "radius": DEFAULT_RADIUS}


def legacy_columns_from_theme(theme: Dict[str, Any]) -> Dict[str, str]:
    """Mirror a theme's light palette back onto the legacy ``*_color`` columns.

    Keeps the bot and any back-compat readers in sync with the new theme model.
    """
    light = theme.get("light") if isinstance(theme, dict) else None
    light = light if isinstance(light, dict) else DEFAULT_LIGHT
    return {
        column: light.get(token, DEFAULT_LIGHT[token])
        for column, token in LEGACY_COLUMN_TO_TOKEN.items()
    }


def resolve_theme(settings: Any) -> Dict[str, Any]:
    """Return the effective theme for a SiteSettings row.

    Prefers ``theme_json`` when present, otherwise reconstructs from legacy
    columns. The result is always complete and valid.
    """
    raw = getattr(settings, "theme_json", None)
    if isinstance(raw, dict) and raw:
        return normalise_theme(raw)
    return theme_from_legacy_columns(settings)


# ── Built-in presets ────────────────────────────────────────────────────────
def _theme(light_overrides: Dict[str, str], dark_overrides: Dict[str, str]) -> Dict[str, Any]:
    light = dict(DEFAULT_LIGHT)
    light.update(light_overrides)
    dark = dict(DEFAULT_DARK)
    dark.update(dark_overrides)
    return {"light": light, "dark": dark, "radius": DEFAULT_RADIUS}


# name → theme. Seeded into brand_themes with is_builtin=True. Each ships a
# hand-tuned light + dark palette so users get a real starting point.
BUILTIN_THEMES: List[Dict[str, Any]] = [
    {
        "name": "Raccoonito (default)",
        "theme": default_theme(),
        "font_family": DEFAULT_BODY_FONT,
        "heading_font_family": DEFAULT_HEADING_FONT,
    },
    {
        "name": "Ocean",
        "theme": _theme(
            {
                "primary": "#0EA5E9", "primary_foreground": "#FFFFFF",
                "secondary": "#38BDF8", "secondary_foreground": "#06283A",
                "background": "#F0F9FF", "foreground": "#0C4A6E",
                "card": "#FFFFFF", "card_foreground": "#0C4A6E",
                "muted": "#E0F2FE", "muted_foreground": "#3D6B86",
                "border": "#BAE6FD", "info": "#0EA5E9", "info_bg": "#E0F2FE",
            },
            {
                "primary": "#38BDF8", "primary_foreground": "#04222F",
                "background": "#0B1722", "foreground": "#DCEEF8",
                "card": "#13212F", "card_foreground": "#DCEEF8",
                "muted": "#1B2C3C", "muted_foreground": "#8FB3C9",
                "border": "#274055",
            },
        ),
        "font_family": "Inter",
        "heading_font_family": "Inter",
    },
    {
        "name": "Forest",
        "theme": _theme(
            {
                "primary": "#22C55E", "primary_foreground": "#062611",
                "secondary": "#4ADE80", "secondary_foreground": "#062611",
                "background": "#F0FDF4", "foreground": "#14532D",
                "card": "#FFFFFF", "card_foreground": "#14532D",
                "muted": "#DCFCE7", "muted_foreground": "#3F7351",
                "border": "#BBF7D0", "success": "#16A34A", "success_bg": "#DCFCE7",
            },
            {
                "primary": "#4ADE80", "primary_foreground": "#052E16",
                "background": "#0C1A12", "foreground": "#DBF4E3",
                "card": "#13251B", "card_foreground": "#DBF4E3",
                "muted": "#1C3326", "muted_foreground": "#8FC2A2",
                "border": "#274A35",
            },
        ),
        "font_family": "Poppins",
        "heading_font_family": "Poppins",
    },
    {
        "name": "Sunset",
        "theme": _theme(
            {
                "primary": "#F97316", "primary_foreground": "#2A1206",
                "secondary": "#FB923C", "secondary_foreground": "#2A1206",
                "background": "#FFF7ED", "foreground": "#431407",
                "card": "#FFFFFF", "card_foreground": "#431407",
                "muted": "#FFEDD5", "muted_foreground": "#925A38",
                "border": "#FED7AA", "warning": "#EA580C", "warning_bg": "#FFEDD5",
            },
            {
                "primary": "#FB923C", "primary_foreground": "#2A1206",
                "background": "#1B130D", "foreground": "#F5E7DB",
                "card": "#271C13", "card_foreground": "#F5E7DB",
                "muted": "#34261A", "muted_foreground": "#C9A98C",
                "border": "#473421",
            },
        ),
        "font_family": "Montserrat",
        "heading_font_family": "Montserrat",
    },
    {
        "name": "Royal Purple",
        "theme": _theme(
            {
                "primary": "#A855F7", "primary_foreground": "#FFFFFF",
                "secondary": "#C084FC", "secondary_foreground": "#2A0A45",
                "background": "#FAF5FF", "foreground": "#3B0764",
                "card": "#FFFFFF", "card_foreground": "#3B0764",
                "muted": "#F3E8FF", "muted_foreground": "#6B4A86",
                "border": "#E9D5FF", "info": "#A855F7", "info_bg": "#F3E8FF",
            },
            {
                "primary": "#C084FC", "primary_foreground": "#2A0A45",
                "background": "#160C20", "foreground": "#ECE0F7",
                "card": "#22152F", "card_foreground": "#ECE0F7",
                "muted": "#2E1D3F", "muted_foreground": "#B79AD0",
                "border": "#3F2B52",
            },
        ),
        "font_family": "Raleway",
        "heading_font_family": "Raleway",
    },
    {
        "name": "Crimson",
        "theme": _theme(
            {
                "primary": "#EF4444", "primary_foreground": "#FFFFFF",
                "secondary": "#F87171", "secondary_foreground": "#3A0A0A",
                "background": "#FFF5F5", "foreground": "#1C1C1C",
                "card": "#FFFFFF", "card_foreground": "#1C1C1C",
                "muted": "#FEE2E2", "muted_foreground": "#8A5050",
                "border": "#FECACA", "danger": "#DC2626", "danger_bg": "#FEE2E2",
            },
            {
                "primary": "#F87171", "primary_foreground": "#3A0A0A",
                "background": "#1A1011", "foreground": "#F3E2E2",
                "card": "#261819", "card_foreground": "#F3E2E2",
                "muted": "#352122", "muted_foreground": "#C99A9A",
                "border": "#4A2C2D",
            },
        ),
        "font_family": "Roboto",
        "heading_font_family": "Roboto",
    },
    {
        "name": "Midnight",
        "theme": _theme(
            {
                "primary": "#6366F1", "primary_foreground": "#FFFFFF",
                "secondary": "#818CF8", "secondary_foreground": "#10122E",
                "background": "#F5F6FF", "foreground": "#1E1B4B",
                "card": "#FFFFFF", "card_foreground": "#1E1B4B",
                "muted": "#E8EAFD", "muted_foreground": "#5A5E8C",
                "border": "#D5D9F7",
            },
            {
                "primary": "#818CF8", "primary_foreground": "#10122E",
                "background": "#0F1018", "foreground": "#D6D9F0",
                "card": "#191B26", "card_foreground": "#D6D9F0",
                "muted": "#232634", "muted_foreground": "#9398B8",
                "border": "#313445",
            },
        ),
        "font_family": "Inter",
        "heading_font_family": "Inter",
    },
]
