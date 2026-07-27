"""add support contacts to site_settings

Revision ID: 0017_support_contacts
Revises: 0016_account_email_notif
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0017_support_contacts"
down_revision: Union[str, Sequence[str], None] = "0016_account_email_notif"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    insp = sa.inspect(op.get_bind())
    if table not in set(insp.get_table_names()):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    cols = _columns("site_settings")
    if not cols:
        return
    if "contact_support_tg_username" not in cols:
        op.add_column("site_settings", sa.Column("contact_support_tg_username", sa.String(length=255), nullable=True))
    if "contact_support_email" not in cols:
        op.add_column("site_settings", sa.Column("contact_support_email", sa.String(length=320), nullable=True))
    if "contact_support_phone" not in cols:
        op.add_column("site_settings", sa.Column("contact_support_phone", sa.String(length=100), nullable=True))


def downgrade() -> None:
    cols = _columns("site_settings")
    for column in ("contact_support_phone", "contact_support_email", "contact_support_tg_username"):
        if column in cols:
            op.drop_column("site_settings", column)
