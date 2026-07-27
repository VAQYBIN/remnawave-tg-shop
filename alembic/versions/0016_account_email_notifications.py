"""add email_notifications_enabled to accounts

Revision ID: 0016_account_email_notif
Revises: 0015_bot_ui_mode
Create Date: 2026-07-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016_account_email_notif"
down_revision: Union[str, Sequence[str], None] = "0015_bot_ui_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "email_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "email_notifications_enabled")
