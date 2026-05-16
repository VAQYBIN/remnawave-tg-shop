"""fix plan FK on delete set null

Revision ID: 0011_fix_plan_fk
Revises: 0010_custom_tariffs_phase1
Create Date: 2026-05-16
"""
from alembic import op

revision = "0011_fix_plan_fk"
down_revision = "0010_custom_tariffs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── payments ──────────────────────────────────────────────────────────
    # Drop existing FKs (no ON DELETE clause)
    op.drop_constraint("fk_payments_pricing_plan_id", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_pricing_plan_option_id", "payments", type_="foreignkey")

    # Recreate with ON DELETE SET NULL
    op.create_foreign_key(
        "fk_payments_pricing_plan_id",
        "payments", "pricing_plans",
        ["pricing_plan_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_payments_pricing_plan_option_id",
        "payments", "pricing_plan_options",
        ["pricing_plan_option_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── subscriptions ─────────────────────────────────────────────────────
    op.drop_constraint("fk_subscriptions_pricing_plan_id", "subscriptions", type_="foreignkey")
    op.drop_constraint("fk_subscriptions_pricing_plan_option_id", "subscriptions", type_="foreignkey")

    op.create_foreign_key(
        "fk_subscriptions_pricing_plan_id",
        "subscriptions", "pricing_plans",
        ["pricing_plan_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_subscriptions_pricing_plan_option_id",
        "subscriptions", "pricing_plan_options",
        ["pricing_plan_option_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Drop SET NULL variants
    op.drop_constraint("fk_payments_pricing_plan_id", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_pricing_plan_option_id", "payments", type_="foreignkey")
    op.drop_constraint("fk_subscriptions_pricing_plan_id", "subscriptions", type_="foreignkey")
    op.drop_constraint("fk_subscriptions_pricing_plan_option_id", "subscriptions", type_="foreignkey")

    # Restore original FKs (no ON DELETE clause)
    op.create_foreign_key(
        "fk_payments_pricing_plan_id",
        "payments", "pricing_plans",
        ["pricing_plan_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_payments_pricing_plan_option_id",
        "payments", "pricing_plan_options",
        ["pricing_plan_option_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_subscriptions_pricing_plan_id",
        "subscriptions", "pricing_plans",
        ["pricing_plan_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_subscriptions_pricing_plan_option_id",
        "subscriptions", "pricing_plan_options",
        ["pricing_plan_option_id"], ["id"],
    )
