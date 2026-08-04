"""add panel_user_id columns for Remnawave v3 numeric ids

Revision ID: 0021_panel_user_id
Revises: 0020_add_lavapay
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_panel_user_id"
down_revision: Union[str, Sequence[str], None] = "0020_add_lavapay"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("panel_user_id", sa.BigInteger(), nullable=True))
    op.create_index(
        "ix_users_panel_user_id", "users", ["panel_user_id"], unique=True
    )

    op.add_column(
        "subscriptions", sa.Column("panel_user_id", sa.BigInteger(), nullable=True)
    )
    op.create_index(
        "ix_subscriptions_panel_user_id", "subscriptions", ["panel_user_id"]
    )

    # После перехода на v3 подписка заводится по числовому id, панельного uuid у неё нет.
    op.alter_column(
        "subscriptions", "panel_user_uuid", existing_type=sa.String(), nullable=True
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE subscriptions SET panel_user_uuid = '' WHERE panel_user_uuid IS NULL"
        )
    )
    op.alter_column(
        "subscriptions", "panel_user_uuid", existing_type=sa.String(), nullable=False
    )
    op.drop_index("ix_subscriptions_panel_user_id", table_name="subscriptions")
    op.drop_column("subscriptions", "panel_user_id")
    op.drop_index("ix_users_panel_user_id", table_name="users")
    op.drop_column("users", "panel_user_id")
