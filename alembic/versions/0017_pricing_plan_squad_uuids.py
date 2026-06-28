"""add multiple Remnawave squad UUIDs to pricing plans

Revision ID: 0017_plan_squad_uuids
Revises: 0016_plan_hwid_limit
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0017_plan_squad_uuids"
down_revision: Union[str, Sequence[str], None] = "0016_plan_hwid_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    if table not in set(insp.get_table_names()):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    cols = _columns("pricing_plans")
    if cols and "remnawave_squad_uuids" not in cols:
        op.add_column("pricing_plans", sa.Column("remnawave_squad_uuids", sa.JSON(), nullable=True))
        bind = op.get_bind()
        if bind.dialect.name == "postgresql":
            op.execute(
                "UPDATE pricing_plans "
                "SET remnawave_squad_uuids = json_build_array(remnawave_squad_uuid) "
                "WHERE remnawave_squad_uuid IS NOT NULL AND remnawave_squad_uuid != ''"
            )
        else:
            op.execute(
                "UPDATE pricing_plans "
                "SET remnawave_squad_uuids = json_array(remnawave_squad_uuid) "
                "WHERE remnawave_squad_uuid IS NOT NULL AND remnawave_squad_uuid != ''"
            )


def downgrade() -> None:
    cols = _columns("pricing_plans")
    if "remnawave_squad_uuids" in cols:
        op.drop_column("pricing_plans", "remnawave_squad_uuids")
