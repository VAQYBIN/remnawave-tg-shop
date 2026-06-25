"""custom tariffs phase 1 data model

Revision ID: 0010_custom_tariffs
Revises: 1bcdf998d07d
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_custom_tariffs"
down_revision: Union[str, Sequence[str], None] = "1bcdf998d07d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return sa.inspect(op.get_bind())


def _tables() -> set[str]:
    return set(_insp().get_table_names())


def _columns(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {column["name"] for column in _insp().get_columns(table)}


def _indexes(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {index["name"] for index in _insp().get_indexes(table)}


def _foreign_keys(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {fk["name"] for fk in _insp().get_foreign_keys(table) if fk.get("name")}


def _first_env_squad_uuid() -> str | None:
    import os

    raw = os.getenv("USER_SQUAD_UUIDS") or ""
    for item in raw.split(","):
        cleaned = item.strip()
        if cleaned:
            return cleaned
    return None


def upgrade() -> None:
    bind = op.get_bind()
    tables = _tables()

    if "pricing_plans" in tables and "pricing_plans_legacy" not in tables:
        op.rename_table("pricing_plans", "pricing_plans_legacy")
        tables = _tables()

    if "pricing_plans" not in tables:
        op.create_table(
            "pricing_plans",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("slug", sa.String(length=100), nullable=False),
            sa.Column("name_ru", sa.String(length=150), nullable=False),
            sa.Column("name_en", sa.String(length=150), nullable=True),
            sa.Column("description_ru", sa.Text(), nullable=True),
            sa.Column("description_en", sa.Text(), nullable=True),
            sa.Column("remnawave_squad_uuid", sa.String(length=64), nullable=True),
            sa.Column("remnawave_squad_name_snapshot", sa.String(length=255), nullable=True),
            sa.Column("plan_kind", sa.String(length=20), nullable=False, server_default="standalone"),
            sa.Column("billing_model", sa.String(length=20), nullable=False, server_default="time"),
            sa.Column("traffic_reset_strategy", sa.String(length=30), nullable=False, server_default="NO_RESET"),
            sa.Column("min_price_rub", sa.Float(), nullable=True),
            sa.Column("min_price_stars", sa.Integer(), nullable=True),
            sa.Column("is_trial", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("slug", name="uq_pricing_plans_slug"),
        )
        op.create_index("ix_pricing_plans_is_enabled", "pricing_plans", ["is_enabled"], unique=False)
        op.create_index("ix_pricing_plans_plan_kind", "pricing_plans", ["plan_kind"], unique=False)

    tables = _tables()
    if "pricing_plan_options" not in tables:
        op.create_table(
            "pricing_plan_options",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("plan_id", sa.Integer(), nullable=False),
            sa.Column("duration_months", sa.Integer(), nullable=True),
            sa.Column("duration_days", sa.Integer(), nullable=True),
            sa.Column("traffic_gb", sa.Float(), nullable=True),
            sa.Column("traffic_unlimited", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("price_rub", sa.Float(), nullable=True),
            sa.Column("price_stars", sa.Integer(), nullable=True),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["plan_id"], ["pricing_plans.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_pricing_plan_options_plan_id", "pricing_plan_options", ["plan_id"], unique=False)
        op.create_index("ix_pricing_plan_options_is_enabled", "pricing_plan_options", ["is_enabled"], unique=False)

    if "user_plan_entitlements" not in tables:
        op.create_table(
            "user_plan_entitlements",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("plan_id", sa.Integer(), nullable=False),
            sa.Column("plan_option_id", sa.Integer(), nullable=True),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("traffic_limit_bytes_added", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("auto_renew_enabled", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deactivation_reason", sa.String(length=50), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["plan_id"], ["pricing_plans.id"]),
            sa.ForeignKeyConstraint(["plan_option_id"], ["pricing_plan_options.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_user_plan_entitlements_user_id", "user_plan_entitlements", ["user_id"], unique=False)
        op.create_index("ix_user_plan_entitlements_plan_id", "user_plan_entitlements", ["plan_id"], unique=False)
        op.create_index("ix_user_plan_entitlements_is_active", "user_plan_entitlements", ["is_active"], unique=False)

    if "entitlement_payments" not in tables:
        op.create_table(
            "entitlement_payments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("entitlement_id", sa.Integer(), nullable=False),
            sa.Column("payment_id", sa.Integer(), nullable=False),
            sa.Column("purpose", sa.String(length=50), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["entitlement_id"], ["user_plan_entitlements.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["payment_id"], ["payments.payment_id"], ondelete="CASCADE"),
            sa.UniqueConstraint("entitlement_id", "payment_id", "purpose", name="uq_entitlement_payment_purpose"),
        )
        op.create_index("ix_entitlement_payments_entitlement_id", "entitlement_payments", ["entitlement_id"], unique=False)
        op.create_index("ix_entitlement_payments_payment_id", "entitlement_payments", ["payment_id"], unique=False)

    payment_columns = _columns("payments")
    payment_additions = (
        ("pricing_plan_id", sa.Column("pricing_plan_id", sa.Integer(), nullable=True)),
        ("pricing_plan_option_id", sa.Column("pricing_plan_option_id", sa.Integer(), nullable=True)),
        ("sale_mode", sa.Column("sale_mode", sa.String(length=20), nullable=True)),
        ("traffic_gb", sa.Column("traffic_gb", sa.Float(), nullable=True)),
        ("duration_months", sa.Column("duration_months", sa.Integer(), nullable=True)),
        ("duration_days", sa.Column("duration_days", sa.Integer(), nullable=True)),
        ("auto_renew_bundle_snapshot", sa.Column("auto_renew_bundle_snapshot", sa.Text(), nullable=True)),
        ("activation_status", sa.Column("activation_status", sa.String(length=30), nullable=True)),
        ("needs_panel_sync", sa.Column("needs_panel_sync", sa.Boolean(), nullable=False, server_default="false")),
    )
    for name, column in payment_additions:
        if name not in payment_columns:
            op.add_column("payments", column)
    if "ix_payments_pricing_plan_id" not in _indexes("payments"):
        op.create_index("ix_payments_pricing_plan_id", "payments", ["pricing_plan_id"], unique=False)
    if "ix_payments_pricing_plan_option_id" not in _indexes("payments"):
        op.create_index("ix_payments_pricing_plan_option_id", "payments", ["pricing_plan_option_id"], unique=False)
    payment_fks = _foreign_keys("payments")
    if "fk_payments_pricing_plan_id" not in payment_fks:
        op.create_foreign_key(
            "fk_payments_pricing_plan_id",
            "payments",
            "pricing_plans",
            ["pricing_plan_id"],
            ["id"],
        )
    if "fk_payments_pricing_plan_option_id" not in payment_fks:
        op.create_foreign_key(
            "fk_payments_pricing_plan_option_id",
            "payments",
            "pricing_plan_options",
            ["pricing_plan_option_id"],
            ["id"],
        )

    subscription_columns = _columns("subscriptions")
    if "pricing_plan_id" not in subscription_columns:
        op.add_column("subscriptions", sa.Column("pricing_plan_id", sa.Integer(), nullable=True))
    if "pricing_plan_option_id" not in subscription_columns:
        op.add_column("subscriptions", sa.Column("pricing_plan_option_id", sa.Integer(), nullable=True))
    if "ix_subscriptions_pricing_plan_id" not in _indexes("subscriptions"):
        op.create_index("ix_subscriptions_pricing_plan_id", "subscriptions", ["pricing_plan_id"], unique=False)
    if "ix_subscriptions_pricing_plan_option_id" not in _indexes("subscriptions"):
        op.create_index("ix_subscriptions_pricing_plan_option_id", "subscriptions", ["pricing_plan_option_id"], unique=False)
    subscription_fks = _foreign_keys("subscriptions")
    if "fk_subscriptions_pricing_plan_id" not in subscription_fks:
        op.create_foreign_key(
            "fk_subscriptions_pricing_plan_id",
            "subscriptions",
            "pricing_plans",
            ["pricing_plan_id"],
            ["id"],
        )
    if "fk_subscriptions_pricing_plan_option_id" not in subscription_fks:
        op.create_foreign_key(
            "fk_subscriptions_pricing_plan_option_id",
            "subscriptions",
            "pricing_plan_options",
            ["pricing_plan_option_id"],
            ["id"],
        )

    # Preserve old admin-configured rows as options under one legacy standalone plan.
    legacy_exists = bind.execute(
        sa.text("SELECT 1 FROM pricing_plans WHERE slug = 'legacy-default' LIMIT 1")
    ).first()
    if not legacy_exists and "pricing_plans_legacy" in _tables():
        squad_uuid = _first_env_squad_uuid()
        insert_legacy_plan = sa.text(
                """
                INSERT INTO pricing_plans (
                    slug, name_ru, name_en, description_ru, description_en,
                    remnawave_squad_uuid, plan_kind, billing_model,
                    traffic_reset_strategy, is_trial, is_enabled, sort_order
                )
                VALUES (
                    'legacy-default', 'Стандартный', 'Default',
                    'Тариф, созданный автоматически из предыдущей схемы.',
                    'Plan automatically created from the previous pricing schema.',
                    :squad_uuid, 'standalone', 'time', 'NO_RESET', false,
                    CASE
                        WHEN :squad_uuid IS NOT NULL
                         AND EXISTS (
                            SELECT 1 FROM pricing_plans_legacy
                            WHERE is_enabled = true
                              AND (price_rub IS NOT NULL OR price_stars IS NOT NULL)
                         )
                        THEN true ELSE false
                    END,
                    0
                )
                """
            ).bindparams(sa.bindparam("squad_uuid", type_=sa.String()))
        bind.execute(
            insert_legacy_plan,
            {"squad_uuid": squad_uuid},
        )
        plan_id = bind.execute(sa.text("SELECT id FROM pricing_plans WHERE slug = 'legacy-default'")).scalar_one()
        bind.execute(
            sa.text(
                """
                INSERT INTO pricing_plan_options (
                    plan_id, duration_months, traffic_gb, traffic_unlimited,
                    price_rub, price_stars, is_enabled, sort_order
                )
                SELECT
                    :plan_id,
                    duration_months,
                    NULL,
                    true,
                    price_rub,
                    price_stars,
                    is_enabled,
                    sort_order
                FROM pricing_plans_legacy
                ORDER BY sort_order, duration_months
                """
            ),
            {"plan_id": plan_id},
        )


def downgrade() -> None:
    if "subscriptions" in _tables():
        for fk_name in ("fk_subscriptions_pricing_plan_option_id", "fk_subscriptions_pricing_plan_id"):
            if fk_name in _foreign_keys("subscriptions"):
                op.drop_constraint(fk_name, "subscriptions", type_="foreignkey")
        if "ix_subscriptions_pricing_plan_option_id" in _indexes("subscriptions"):
            op.drop_index("ix_subscriptions_pricing_plan_option_id", table_name="subscriptions")
        if "ix_subscriptions_pricing_plan_id" in _indexes("subscriptions"):
            op.drop_index("ix_subscriptions_pricing_plan_id", table_name="subscriptions")
        for column in ("pricing_plan_option_id", "pricing_plan_id"):
            if column in _columns("subscriptions"):
                op.drop_column("subscriptions", column)

    if "payments" in _tables():
        for fk_name in ("fk_payments_pricing_plan_option_id", "fk_payments_pricing_plan_id"):
            if fk_name in _foreign_keys("payments"):
                op.drop_constraint(fk_name, "payments", type_="foreignkey")
        if "ix_payments_pricing_plan_option_id" in _indexes("payments"):
            op.drop_index("ix_payments_pricing_plan_option_id", table_name="payments")
        if "ix_payments_pricing_plan_id" in _indexes("payments"):
            op.drop_index("ix_payments_pricing_plan_id", table_name="payments")
        for column in (
            "needs_panel_sync",
            "activation_status",
            "auto_renew_bundle_snapshot",
            "duration_days",
            "duration_months",
            "traffic_gb",
            "sale_mode",
            "pricing_plan_option_id",
            "pricing_plan_id",
        ):
            if column in _columns("payments"):
                op.drop_column("payments", column)

    for table in ("entitlement_payments", "user_plan_entitlements", "pricing_plan_options"):
        if table in _tables():
            op.drop_table(table)

    if "pricing_plans" in _tables():
        op.drop_table("pricing_plans")
    if "pricing_plans_legacy" in _tables():
        op.rename_table("pricing_plans_legacy", "pricing_plans")
