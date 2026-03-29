"""add web accounts, email verification codes, channel posts

Revision ID: bcfe200c3b63
Revises: 0003_promo_curr_act_not_null
Create Date: 2026-03-25 23:14:55.646552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'bcfe200c3b63'
down_revision: Union[str, Sequence[str], None] = '0003_promo_curr_act_not_null'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    """Return a fresh Inspector for the current connection."""
    return sa.inspect(op.get_bind())


def _idx_names(table: str) -> set:
    return {i['name'] for i in _insp().get_indexes(table)}


def _uq_names(table: str) -> set:
    return {c['name'] for c in _insp().get_unique_constraints(table)}


def upgrade() -> None:
    insp = _insp()

    # ── channel_posts ────────────────────────────────────────────────────────
    if not insp.has_table('channel_posts'):
        op.create_table(
            'channel_posts',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('telegram_message_id', sa.BigInteger(), nullable=False),
            sa.Column('channel_id', sa.BigInteger(), nullable=False),
            sa.Column('text', sa.Text(), nullable=True),
            sa.Column('entities_json', sa.Text(), nullable=True),
            sa.Column('media_type', sa.String(length=20), nullable=True),
            sa.Column('media_file_id', sa.String(length=255), nullable=True),
            sa.Column('media_url', sa.Text(), nullable=True),
            sa.Column('posted_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('telegram_message_id'),
        )
        op.create_index('ix_channel_posts_channel_id', 'channel_posts', ['channel_id'], unique=False)
        op.create_index('ix_channel_posts_posted_at', 'channel_posts', ['posted_at'], unique=False)
    else:
        idx = _idx_names('channel_posts')
        if 'ix_channel_posts_channel_id' not in idx:
            op.create_index('ix_channel_posts_channel_id', 'channel_posts', ['channel_id'], unique=False)
        if 'ix_channel_posts_posted_at' not in idx:
            op.create_index('ix_channel_posts_posted_at', 'channel_posts', ['posted_at'], unique=False)

    # ── accounts ─────────────────────────────────────────────────────────────
    if not _insp().has_table('accounts'):
        op.create_table(
            'accounts',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=True),
            sa.Column('password_hash', sa.String(length=255), nullable=True),
            sa.Column('telegram_user_id', sa.BigInteger(), nullable=True),
            sa.Column('is_email_verified', sa.Boolean(), nullable=False),
            sa.Column('language_code', sa.String(length=10), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['telegram_user_id'], ['users.user_id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_accounts_email', 'accounts', ['email'], unique=True)
        op.create_index('ix_accounts_telegram_user_id', 'accounts', ['telegram_user_id'], unique=True)
    else:
        idx = _idx_names('accounts')
        if 'ix_accounts_email' not in idx:
            op.create_index('ix_accounts_email', 'accounts', ['email'], unique=True)
        if 'ix_accounts_telegram_user_id' not in idx:
            op.create_index('ix_accounts_telegram_user_id', 'accounts', ['telegram_user_id'], unique=True)

    # ── email_verification_codes ──────────────────────────────────────────────
    if not _insp().has_table('email_verification_codes'):
        op.create_table(
            'email_verification_codes',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('account_id', sa.UUID(), nullable=True),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('code', sa.String(length=6), nullable=False),
            sa.Column('purpose', sa.String(length=20), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('used', sa.Boolean(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_email_verification_codes_email', 'email_verification_codes', ['email'], unique=False)
    else:
        if 'ix_email_verification_codes_email' not in _idx_names('email_verification_codes'):
            op.create_index('ix_email_verification_codes_email', 'email_verification_codes', ['email'], unique=False)

    # ── active_discounts ──────────────────────────────────────────────────────
    # DROP NOT NULL is idempotent in PostgreSQL
    op.alter_column(
        'active_discounts', 'activated_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        nullable=True,
        existing_server_default=sa.text('now()'),
    )
    if 'idx_active_discounts_expires_at' in _idx_names('active_discounts'):
        op.drop_index('idx_active_discounts_expires_at', table_name='active_discounts')

    # ── ad_attributions ───────────────────────────────────────────────────────
    if 'ix_ad_attributions_user_id' not in _idx_names('ad_attributions'):
        op.create_index('ix_ad_attributions_user_id', 'ad_attributions', ['user_id'], unique=False)

    # ── ad_campaigns ──────────────────────────────────────────────────────────
    op.execute(sa.text("ALTER TABLE ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_start_param_key"))
    if 'ix_ad_campaigns_start_param' not in _idx_names('ad_campaigns'):
        op.create_index('ix_ad_campaigns_start_param', 'ad_campaigns', ['start_param'], unique=True)

    # ── panel_sync_status ─────────────────────────────────────────────────────
    # Check if any unique constraint covering only (id) already exists
    existing_uq = _insp().get_unique_constraints('panel_sync_status')
    has_id_uq = any(c.get('column_names') == ['id'] for c in existing_uq)
    if not has_id_uq:
        op.create_unique_constraint(None, 'panel_sync_status', ['id'])

    # ── payments ──────────────────────────────────────────────────────────────
    op.execute(sa.text("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_yookassa_payment_id_key"))
    if 'ix_payments_yookassa_payment_id' not in _idx_names('payments'):
        op.create_index('ix_payments_yookassa_payment_id', 'payments', ['yookassa_payment_id'], unique=True)

    # ── promo_codes ───────────────────────────────────────────────────────────
    # DROP NOT NULL → SET NULL is idempotent in PostgreSQL
    op.alter_column(
        'promo_codes', 'current_activations',
        existing_type=sa.INTEGER(),
        nullable=True,
        existing_server_default=sa.text('0'),
    )
    if 'idx_promo_codes_promo_type' in _idx_names('promo_codes'):
        op.drop_index('idx_promo_codes_promo_type', table_name='promo_codes')
    op.execute(sa.text("ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_code_key"))
    idx = _idx_names('promo_codes')
    if 'ix_promo_codes_code' not in idx:
        op.create_index('ix_promo_codes_code', 'promo_codes', ['code'], unique=True)
    if 'ix_promo_codes_promo_type' not in idx:
        op.create_index('ix_promo_codes_promo_type', 'promo_codes', ['promo_type'], unique=False)

    # ── subscriptions ─────────────────────────────────────────────────────────
    op.execute(sa.text("ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_panel_subscription_uuid_key"))
    if 'ix_subscriptions_panel_subscription_uuid' not in _idx_names('subscriptions'):
        op.create_index('ix_subscriptions_panel_subscription_uuid', 'subscriptions', ['panel_subscription_uuid'], unique=True)

    # ── user_payment_methods ──────────────────────────────────────────────────
    op.execute(sa.text(
        "ALTER TABLE user_payment_methods DROP CONSTRAINT IF EXISTS "
        "user_payment_methods_provider_payment_method_id_key"
    ))
    if 'ix_user_payment_methods_provider_payment_method_id' not in _idx_names('user_payment_methods'):
        op.create_index(
            'ix_user_payment_methods_provider_payment_method_id',
            'user_payment_methods', ['provider_payment_method_id'], unique=True,
        )

    # ── users ─────────────────────────────────────────────────────────────────
    op.execute(sa.text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_panel_user_uuid_key"))
    op.execute(sa.text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_referral_code_key"))
    idx = _idx_names('users')
    if 'ix_users_panel_user_uuid' not in idx:
        op.create_index('ix_users_panel_user_uuid', 'users', ['panel_user_uuid'], unique=True)
    if 'ix_users_referral_code' not in idx:
        op.create_index('ix_users_referral_code', 'users', ['referral_code'], unique=True)
    if 'ix_users_user_id' not in idx:
        op.create_index('ix_users_user_id', 'users', ['user_id'], unique=False)


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_users_user_id'), table_name='users')
    op.drop_index(op.f('ix_users_referral_code'), table_name='users')
    op.drop_index(op.f('ix_users_panel_user_uuid'), table_name='users')
    op.create_unique_constraint(op.f('users_referral_code_key'), 'users', ['referral_code'], postgresql_nulls_not_distinct=False)
    op.create_unique_constraint(op.f('users_panel_user_uuid_key'), 'users', ['panel_user_uuid'], postgresql_nulls_not_distinct=False)
    op.drop_index(op.f('ix_user_payment_methods_provider_payment_method_id'), table_name='user_payment_methods')
    op.create_unique_constraint(op.f('user_payment_methods_provider_payment_method_id_key'), 'user_payment_methods', ['provider_payment_method_id'], postgresql_nulls_not_distinct=False)
    op.drop_index(op.f('ix_subscriptions_panel_subscription_uuid'), table_name='subscriptions')
    op.create_unique_constraint(op.f('subscriptions_panel_subscription_uuid_key'), 'subscriptions', ['panel_subscription_uuid'], postgresql_nulls_not_distinct=False)
    op.drop_index(op.f('ix_promo_codes_promo_type'), table_name='promo_codes')
    op.drop_index(op.f('ix_promo_codes_code'), table_name='promo_codes')
    op.create_unique_constraint(op.f('promo_codes_code_key'), 'promo_codes', ['code'], postgresql_nulls_not_distinct=False)
    op.create_index(op.f('idx_promo_codes_promo_type'), 'promo_codes', ['promo_type'], unique=False)
    op.alter_column('promo_codes', 'current_activations',
               existing_type=sa.INTEGER(),
               nullable=False,
               existing_server_default=sa.text('0'))
    op.drop_index(op.f('ix_payments_yookassa_payment_id'), table_name='payments')
    op.create_unique_constraint(op.f('payments_yookassa_payment_id_key'), 'payments', ['yookassa_payment_id'], postgresql_nulls_not_distinct=False)
    op.drop_constraint(None, 'panel_sync_status', type_='unique')
    op.drop_index(op.f('ix_ad_campaigns_start_param'), table_name='ad_campaigns')
    op.create_unique_constraint(op.f('ad_campaigns_start_param_key'), 'ad_campaigns', ['start_param'], postgresql_nulls_not_distinct=False)
    op.drop_index(op.f('ix_ad_attributions_user_id'), table_name='ad_attributions')
    op.create_index(op.f('idx_active_discounts_expires_at'), 'active_discounts', ['expires_at'], unique=False)
    op.alter_column('active_discounts', 'activated_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=False,
               existing_server_default=sa.text('now()'))
    op.drop_index(op.f('ix_email_verification_codes_email'), table_name='email_verification_codes')
    op.drop_table('email_verification_codes')
    op.drop_index(op.f('ix_accounts_telegram_user_id'), table_name='accounts')
    op.drop_index(op.f('ix_accounts_email'), table_name='accounts')
    op.drop_table('accounts')
    op.drop_index(op.f('ix_channel_posts_posted_at'), table_name='channel_posts')
    op.drop_index(op.f('ix_channel_posts_channel_id'), table_name='channel_posts')
    op.drop_table('channel_posts')
    # ### end Alembic commands ###
