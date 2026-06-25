"""branding themes: light/dark palettes, fonts, saved presets

Adds the full design-token theme structure to site_settings (theme_json,
heading_font_family, default_color_scheme), creates the brand_themes table for
saved/built-in presets, backfills theme_json for the existing settings row from
the legacy *_color columns, and seeds the built-in presets.

Revision ID: 0014_branding_themes
Revises: 0013_sub_auto_renew_not_null
Create Date: 2026-06-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from core.services.branding_theme import (
    DEFAULT_LIGHT,
    DEFAULT_DARK,
    DEFAULT_RADIUS,
    LEGACY_COLUMN_TO_TOKEN,
    is_hex_color,
    BUILTIN_THEMES,
)


revision: str = "0014_branding_themes"
down_revision: Union[str, Sequence[str], None] = "0013_sub_auto_renew_not_null"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _tables() -> set:
    return set(_insp().get_table_names())


def _columns(table: str) -> set:
    if table not in _tables():
        return set()
    return {column["name"] for column in _insp().get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    site_cols = _columns("site_settings")

    if "site_settings" in _tables():
        if "theme_json" not in site_cols:
            op.add_column("site_settings", sa.Column("theme_json", sa.JSON(), nullable=True))
        if "heading_font_family" not in site_cols:
            op.add_column("site_settings", sa.Column("heading_font_family", sa.String(length=100), nullable=True))
        if "default_color_scheme" not in site_cols:
            op.add_column(
                "site_settings",
                sa.Column("default_color_scheme", sa.String(length=10), nullable=False, server_default="light"),
            )

    # Built-in / saved presets
    if "brand_themes" not in _tables():
        op.create_table(
            "brand_themes",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("theme_json", sa.JSON(), nullable=False),
            sa.Column("font_family", sa.String(length=100), nullable=True),
            sa.Column("heading_font_family", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_brand_themes_is_builtin", "brand_themes", ["is_builtin"])

    # ── Backfill theme_json for the existing settings row from legacy columns ──
    row = bind.execute(
        sa.text(
            "SELECT primary_color, secondary_color, background_color, "
            "foreground_color, card_color, border_color, theme_json "
            "FROM site_settings WHERE id = 1"
        )
    ).mappings().first()
    if row is not None and not row.get("theme_json"):
        light = dict(DEFAULT_LIGHT)
        for column, token in LEGACY_COLUMN_TO_TOKEN.items():
            value = row.get(column)
            if is_hex_color(value):
                light[token] = value
        light["card_foreground"] = light["foreground"]
        theme = {"light": light, "dark": dict(DEFAULT_DARK), "radius": DEFAULT_RADIUS}
        bind.execute(
            sa.text("UPDATE site_settings SET theme_json = :theme WHERE id = 1").bindparams(
                sa.bindparam("theme", value=theme, type_=sa.JSON())
            )
        )

    # ── Seed built-in presets (skip if a builtin with the same name exists) ──
    existing = {
        r[0]
        for r in bind.execute(
            sa.text("SELECT name FROM brand_themes WHERE is_builtin = true")
        ).fetchall()
    }
    for preset in BUILTIN_THEMES:
        if preset["name"] in existing:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO brand_themes (name, is_builtin, theme_json, font_family, heading_font_family) "
                "VALUES (:name, true, :theme, :font, :heading)"
            ).bindparams(
                sa.bindparam("name", value=preset["name"]),
                sa.bindparam("theme", value=preset["theme"], type_=sa.JSON()),
                sa.bindparam("font", value=preset.get("font_family")),
                sa.bindparam("heading", value=preset.get("heading_font_family")),
            )
        )


def downgrade() -> None:
    tables = _tables()
    if "brand_themes" in tables:
        op.drop_table("brand_themes")
    site_cols = _columns("site_settings")
    if "default_color_scheme" in site_cols:
        op.drop_column("site_settings", "default_color_scheme")
    if "heading_font_family" in site_cols:
        op.drop_column("site_settings", "heading_font_family")
    if "theme_json" in site_cols:
        op.drop_column("site_settings", "theme_json")
