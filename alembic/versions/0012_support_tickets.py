"""support tickets

Revision ID: 0012_support_tickets
Revises: 77d18bb308d7
Create Date: 2026-06-10 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_support_tickets"
down_revision: Union[str, Sequence[str], None] = "77d18bb308d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _tables() -> set:
    return set(_insp().get_table_names())


def _columns(table: str) -> set:
    if table not in _tables():
        return set()
    return {column["name"] for column in _insp().get_columns(table)}


def upgrade() -> None:
    tables = _tables()

    # Feature flag column on site_settings
    if "site_settings" in tables and "support_enabled" not in _columns("site_settings"):
        op.add_column(
            "site_settings",
            sa.Column("support_enabled", sa.Boolean(), nullable=False, server_default="true"),
        )

    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("account_id", sa.UUID(), nullable=False),
            sa.Column("subject", sa.String(length=200), nullable=False),
            sa.Column("category", sa.String(length=30), nullable=False, server_default="other"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
            sa.Column("unread_by_admin", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("unread_by_user", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("last_message_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_support_tickets_account_id", "support_tickets", ["account_id"])
        op.create_index("ix_support_tickets_category", "support_tickets", ["category"])
        op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
        op.create_index("ix_support_tickets_last_message_at", "support_tickets", ["last_message_at"])

    if "support_ticket_messages" not in tables:
        op.create_table(
            "support_ticket_messages",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("ticket_id", sa.Integer(), nullable=False),
            sa.Column("sender_type", sa.String(length=10), nullable=False),
            sa.Column("sender_account_id", sa.UUID(), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["sender_account_id"], ["accounts.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_support_ticket_messages_ticket_id", "support_ticket_messages", ["ticket_id"])
        op.create_index("ix_support_ticket_messages_created_at", "support_ticket_messages", ["created_at"])

    if "support_ticket_attachments" not in tables:
        op.create_table(
            "support_ticket_attachments",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("message_id", sa.Integer(), nullable=True),
            sa.Column("account_id", sa.UUID(), nullable=False),
            sa.Column("file_path", sa.String(length=500), nullable=False),
            sa.Column("url", sa.String(length=500), nullable=False),
            sa.Column("content_type", sa.String(length=100), nullable=True),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["message_id"], ["support_ticket_messages.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_support_ticket_attachments_message_id", "support_ticket_attachments", ["message_id"])
        op.create_index("ix_support_ticket_attachments_account_id", "support_ticket_attachments", ["account_id"])


def downgrade() -> None:
    tables = _tables()
    if "support_ticket_attachments" in tables:
        op.drop_table("support_ticket_attachments")
    if "support_ticket_messages" in tables:
        op.drop_table("support_ticket_messages")
    if "support_tickets" in tables:
        op.drop_table("support_tickets")
    if "site_settings" in tables and "support_enabled" in _columns("site_settings"):
        op.drop_column("site_settings", "support_enabled")
