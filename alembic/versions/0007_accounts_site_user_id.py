"""add site user id to accounts

Revision ID: 0007_accounts_site_user_id
Revises: 349c74b38ed6
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_accounts_site_user_id"
down_revision: Union[str, Sequence[str], None] = "349c74b38ed6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _column_names(table: str) -> set[str]:
    return {c["name"] for c in _insp().get_columns(table)}


def _idx_names(table: str) -> set[str]:
    return {i["name"] for i in _insp().get_indexes(table)}


def _fk_names(table: str) -> set[str]:
    return {fk["name"] for fk in _insp().get_foreign_keys(table) if fk.get("name")}


def upgrade() -> None:
    if "site_user_id" not in _column_names("accounts"):
        op.add_column("accounts", sa.Column("site_user_id", sa.BigInteger(), nullable=True))

    if "ix_accounts_site_user_id" not in _idx_names("accounts"):
        op.create_index("ix_accounts_site_user_id", "accounts", ["site_user_id"], unique=True)

    if "fk_accounts_site_user_id_users" not in _fk_names("accounts"):
        op.create_foreign_key(
            "fk_accounts_site_user_id_users",
            "accounts",
            "users",
            ["site_user_id"],
            ["user_id"],
        )


def downgrade() -> None:
    if "fk_accounts_site_user_id_users" in _fk_names("accounts"):
        op.drop_constraint("fk_accounts_site_user_id_users", "accounts", type_="foreignkey")
    if "ix_accounts_site_user_id" in _idx_names("accounts"):
        op.drop_index("ix_accounts_site_user_id", table_name="accounts")
    if "site_user_id" in _column_names("accounts"):
        op.drop_column("accounts", "site_user_id")
