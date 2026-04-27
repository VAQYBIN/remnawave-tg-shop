"""add pricing_plans and payment_provider_configs tables

Revision ID: 0006_plans_providers
Revises: 0005_add_site_settings
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0006_plans_providers'
down_revision: Union[str, Sequence[str], None] = '0005_add_site_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pricing_plans',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('duration_months', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(100), nullable=True),
        sa.Column('price_rub', sa.Float(), nullable=True),
        sa.Column('price_stars', sa.Integer(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'payment_provider_configs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('provider_key', sa.String(50), nullable=False, unique=True),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Seed pricing_plans — standard time-based plans (disabled by default)
    op.execute("""
        INSERT INTO pricing_plans (duration_months, label, is_enabled, sort_order)
        VALUES
            (1,  '1 месяц',   false, 1),
            (3,  '3 месяца',  false, 2),
            (6,  '6 месяцев', false, 3),
            (12, '12 месяцев', false, 4)
    """)

    # Seed payment_provider_configs — known providers (disabled by default)
    op.execute("""
        INSERT INTO payment_provider_configs (provider_key, display_name, is_enabled, sort_order)
        VALUES
            ('freekassa',  'FreeKassa',  false, 1),
            ('platega',    'Platega',    false, 2),
            ('severpay',   'SeverPay',   false, 3),
            ('yookassa',   'ЮKassa',     false, 4),
            ('stars',      'Telegram Stars', false, 5),
            ('cryptopay',  'CryptoPay',  false, 6)
    """)


def downgrade() -> None:
    op.drop_table('payment_provider_configs')
    op.drop_table('pricing_plans')
