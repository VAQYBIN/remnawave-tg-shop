"""add site_settings table

Revision ID: 0005_add_site_settings
Revises: bcfe200c3b63
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005_add_site_settings'
down_revision: Union[str, Sequence[str], None] = '0004_channel_post_reply_markup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'site_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('brand_name', sa.String(100), nullable=False, server_default='Raccoonito'),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('favicon_url', sa.String(500), nullable=True),
        sa.Column('primary_color', sa.String(20), nullable=False, server_default='#2AACDF'),
        sa.Column('secondary_color', sa.String(20), nullable=False, server_default='#897569'),
        sa.Column('background_color', sa.String(20), nullable=False, server_default='#F5F1ED'),
        sa.Column('font_family', sa.String(100), nullable=False, server_default='Nunito'),
        sa.Column('custom_css', sa.Text(), nullable=True),
        sa.Column('news_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('referral_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('devices_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('id'),
    )

    # Seed default row
    op.execute(
        "INSERT INTO site_settings (id, brand_name, primary_color, secondary_color, "
        "background_color, font_family, news_enabled, referral_enabled, devices_enabled) "
        "VALUES (1, 'Raccoonito', '#2AACDF', '#897569', '#F5F1ED', 'Nunito', true, true, true)"
    )


def downgrade() -> None:
    op.drop_table('site_settings')
