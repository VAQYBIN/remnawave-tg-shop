"""add bot_ui_mode to site_settings

Revision ID: 0015_bot_ui_mode
Revises: 0014_branding_themes
Create Date: 2026-06-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015_bot_ui_mode"
down_revision: Union[str, Sequence[str], None] = "0014_branding_themes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column(
            "bot_ui_mode",
            sa.String(20),
            nullable=False,
            server_default="inline",
        ),
    )


def downgrade() -> None:
    op.drop_column("site_settings", "bot_ui_mode")
