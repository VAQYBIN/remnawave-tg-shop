"""add per-plan HWID device limit

Revision ID: 0016_plan_hwid_limit
Revises: 0015_bot_ui_mode
Create Date: 2026-06-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016_plan_hwid_limit"
down_revision: Union[str, Sequence[str], None] = "0015_bot_ui_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    if table not in set(insp.get_table_names()):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    cols = _columns("pricing_plans")
    if cols and "hwid_device_limit" not in cols:
        op.add_column("pricing_plans", sa.Column("hwid_device_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    cols = _columns("pricing_plans")
    if "hwid_device_limit" in cols:
        op.drop_column("pricing_plans", "hwid_device_limit")
