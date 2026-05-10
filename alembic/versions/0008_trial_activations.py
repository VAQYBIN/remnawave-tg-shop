"""add trial activations

Revision ID: 0008_trial_activations
Revises: 28b35737fcfa
Create Date: 2026-05-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008_trial_activations"
down_revision: Union[str, Sequence[str], None] = "28b35737fcfa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _table_names() -> set[str]:
    return set(_insp().get_table_names())


def _idx_names(table: str) -> set[str]:
    if table not in _table_names():
        return set()
    return {i["name"] for i in _insp().get_indexes(table)}


def upgrade() -> None:
    if "trial_activations" not in _table_names():
        op.create_table(
            "trial_activations",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
            sa.Column("site_user_id", sa.BigInteger(), nullable=True),
            sa.Column("source", sa.String(length=20), nullable=False),
            sa.Column("activated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("reset_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reset_by_admin_id", sa.BigInteger(), nullable=True),
            sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = _idx_names("trial_activations")
    for name, columns in (
        ("ix_trial_activations_account_id", ["account_id"]),
        ("ix_trial_activations_user_id", ["user_id"]),
        ("ix_trial_activations_telegram_user_id", ["telegram_user_id"]),
        ("ix_trial_activations_site_user_id", ["site_user_id"]),
        ("ix_trial_activations_source", ["source"]),
        ("ix_trial_activations_reset_at", ["reset_at"]),
    ):
        if name not in indexes:
            op.create_index(name, "trial_activations", columns, unique=False)

    indexes = _idx_names("trial_activations")
    if "uq_trial_active_user_id" not in indexes:
        op.create_index(
            "uq_trial_active_user_id",
            "trial_activations",
            ["user_id"],
            unique=True,
            postgresql_where=sa.text("reset_at IS NULL"),
        )
    if "uq_trial_active_telegram_user_id" not in indexes:
        op.create_index(
            "uq_trial_active_telegram_user_id",
            "trial_activations",
            ["telegram_user_id"],
            unique=True,
            postgresql_where=sa.text("telegram_user_id IS NOT NULL AND reset_at IS NULL"),
        )
    if "uq_trial_active_site_user_id" not in indexes:
        op.create_index(
            "uq_trial_active_site_user_id",
            "trial_activations",
            ["site_user_id"],
            unique=True,
            postgresql_where=sa.text("site_user_id IS NOT NULL AND reset_at IS NULL"),
        )
    if "uq_trial_active_account_id" not in indexes:
        op.create_index(
            "uq_trial_active_account_id",
            "trial_activations",
            ["account_id"],
            unique=True,
            postgresql_where=sa.text("account_id IS NOT NULL AND reset_at IS NULL"),
        )


def downgrade() -> None:
    if "trial_activations" not in _table_names():
        return
    for name in (
        "uq_trial_active_account_id",
        "uq_trial_active_site_user_id",
        "uq_trial_active_telegram_user_id",
        "uq_trial_active_user_id",
        "ix_trial_activations_reset_at",
        "ix_trial_activations_source",
        "ix_trial_activations_site_user_id",
        "ix_trial_activations_telegram_user_id",
        "ix_trial_activations_user_id",
        "ix_trial_activations_account_id",
    ):
        if name in _idx_names("trial_activations"):
            op.drop_index(name, table_name="trial_activations")
    op.drop_table("trial_activations")
