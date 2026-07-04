"""add support contacts to site_settings

Revision ID: 0020_site_settings_support_contacts
Revises: 0019_add_lavapay_provider
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020_site_settings_support_contacts"
down_revision: Union[str, Sequence[str], None] = "0019_add_lavapay_provider"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("site_settings", sa.Column("contact_support_tg_username", sa.String(length=255), nullable=True))
    op.add_column("site_settings", sa.Column("contact_support_email", sa.String(length=320), nullable=True))
    op.add_column("site_settings", sa.Column("contact_support_phone", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("site_settings", "contact_support_phone")
    op.drop_column("site_settings", "contact_support_email")
    op.drop_column("site_settings", "contact_support_tg_username")
