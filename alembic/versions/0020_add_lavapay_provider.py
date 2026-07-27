"""add lavapay payment provider config row

Revision ID: 0020_add_lavapay
Revises: 0019_plan_squad_uuids
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0020_add_lavapay"
down_revision: Union[str, Sequence[str], None] = "0019_plan_squad_uuids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "payment_provider_configs" not in set(insp.get_table_names()):
        return
    op.execute(
        """
        INSERT INTO payment_provider_configs (provider_key, display_name, is_enabled, sort_order)
        VALUES ('lavapay', 'LavaPay', false, 0)
        ON CONFLICT (provider_key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM payment_provider_configs WHERE provider_key = 'lavapay'")
