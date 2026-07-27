"""add multiple Remnawave squad UUIDs to pricing plans

Revision ID: 0019_plan_squad_uuids
Revises: 0018_plan_hwid_limit
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0019_plan_squad_uuids"
down_revision: Union[str, Sequence[str], None] = "0018_plan_hwid_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    if table not in set(insp.get_table_names()):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    cols = _columns("pricing_plans")
    if not cols or "remnawave_squad_uuids" in cols:
        return

    op.add_column("pricing_plans", sa.Column("remnawave_squad_uuids", sa.JSON(), nullable=True))
    # Backfill from the existing single-squad column so plans keep working
    bind = op.get_bind()
    array_fn = "json_build_array" if bind.dialect.name == "postgresql" else "json_array"
    op.execute(
        f"UPDATE pricing_plans SET remnawave_squad_uuids = {array_fn}(remnawave_squad_uuid) "
        "WHERE remnawave_squad_uuid IS NOT NULL AND remnawave_squad_uuid != ''"
    )


def downgrade() -> None:
    if "remnawave_squad_uuids" in _columns("pricing_plans"):
        op.drop_column("pricing_plans", "remnawave_squad_uuids")
