"""add lavapay payment provider

Revision ID: 0019_add_lavapay_provider
Revises: 0017_plan_squad_uuids
Create Date: 2026-06-28

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0019_add_lavapay_provider"
down_revision: Union[str, Sequence[str], None] = "0017_plan_squad_uuids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO payment_provider_configs (provider_key, display_name, is_enabled, sort_order)
        VALUES ('lavapay', 'LavaPay', false, 0)
        ON CONFLICT (provider_key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM payment_provider_configs WHERE provider_key = 'lavapay'")
