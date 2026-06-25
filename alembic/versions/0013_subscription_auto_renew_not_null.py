"""backfill subscriptions.auto_renew_enabled NULL -> false and make NOT NULL

Legacy subscriptions (bot trial/purchase/panel-sync created before the value was
always set explicitly) could store NULL in auto_renew_enabled. The web and admin
Pydantic schemas require a non-null bool, so serializing such a subscription raised
a ValidationError (HTTP 500): the client subscription page showed "no subscription"
and the admin user-detail endpoint failed outright.

Revision ID: 0013_sub_auto_renew_not_null
Revises: 0012_support_tickets
Create Date: 2026-06-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_sub_auto_renew_not_null"
down_revision: Union[str, Sequence[str], None] = "0012_support_tickets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> dict:
    insp = sa.inspect(op.get_bind())
    if table not in set(insp.get_table_names()):
        return {}
    return {c["name"]: c for c in insp.get_columns(table)}


def upgrade() -> None:
    cols = _columns("subscriptions")
    if "auto_renew_enabled" not in cols:
        return

    # 1. Backfill ambiguous legacy NULL values to false (conservative: do not
    #    surface auto-renew as enabled for users who never opted in).
    op.execute(
        "UPDATE subscriptions SET auto_renew_enabled = false "
        "WHERE auto_renew_enabled IS NULL"
    )

    # 2. Enforce NOT NULL with a server default for any future rows that omit it.
    if cols["auto_renew_enabled"].get("nullable", True):
        op.alter_column(
            "subscriptions",
            "auto_renew_enabled",
            existing_type=sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        )


def downgrade() -> None:
    cols = _columns("subscriptions")
    if "auto_renew_enabled" not in cols:
        return
    op.alter_column(
        "subscriptions",
        "auto_renew_enabled",
        existing_type=sa.Boolean(),
        nullable=True,
        server_default=None,
    )
