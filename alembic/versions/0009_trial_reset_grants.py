"""add trial reset grants

Revision ID: 0009_trial_reset_grants
Revises: 0008_trial_activations
Create Date: 2026-05-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_trial_reset_grants"
down_revision: Union[str, None] = "0008_trial_activations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "trial_reset_grants" not in tables:
        op.create_table(
            "trial_reset_grants",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("telegram_user_id", sa.BigInteger(), nullable=True),
            sa.Column("site_user_id", sa.BigInteger(), nullable=True),
            sa.Column("granted_by_admin_id", sa.BigInteger(), nullable=True),
            sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("trial_reset_grants")}
    for name, column, where in (
        ("ix_trial_reset_grants_account_id", "account_id", None),
        ("ix_trial_reset_grants_user_id", "user_id", None),
        ("ix_trial_reset_grants_telegram_user_id", "telegram_user_id", None),
        ("ix_trial_reset_grants_site_user_id", "site_user_id", None),
        ("ix_trial_reset_grants_used_at", "used_at", None),
        ("uq_trial_reset_grant_unused_user_id", "user_id", "used_at IS NULL"),
        (
            "uq_trial_reset_grant_unused_telegram_user_id",
            "telegram_user_id",
            "telegram_user_id IS NOT NULL AND used_at IS NULL",
        ),
        (
            "uq_trial_reset_grant_unused_site_user_id",
            "site_user_id",
            "site_user_id IS NOT NULL AND used_at IS NULL",
        ),
        (
            "uq_trial_reset_grant_unused_account_id",
            "account_id",
            "account_id IS NOT NULL AND used_at IS NULL",
        ),
    ):
        if name in existing_indexes:
            continue
        op.create_index(
            name,
            "trial_reset_grants",
            [column],
            unique=name.startswith("uq_"),
            postgresql_where=sa.text(where) if where else None,
        )


def downgrade() -> None:
    op.drop_table("trial_reset_grants")
