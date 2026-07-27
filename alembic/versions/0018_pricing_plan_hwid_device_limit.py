"""add per-plan HWID device limit

Revision ID: 0018_plan_hwid_limit
Revises: 0017_support_contacts
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0018_plan_hwid_limit"
down_revision: Union[str, Sequence[str], None] = "0017_support_contacts"
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
    if "hwid_device_limit" in _columns("pricing_plans"):
        op.drop_column("pricing_plans", "hwid_device_limit")
