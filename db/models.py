import uuid as _uuid
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Float, ForeignKey, UniqueConstraint, Text, BigInteger, Index
from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column, backref
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from typing import Optional


class Base(AsyncAttrs, DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    user_id = Column(BigInteger, primary_key=True, index=True)
    username = Column(String, nullable=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    language_code = Column(String, default="ru")
    registration_date = Column(DateTime(timezone=True),
                               server_default=func.now())
    is_banned = Column(Boolean, default=False)
    panel_user_uuid = Column(String, nullable=True, unique=True, index=True)
    referral_code = Column(String(16), nullable=True, unique=True, index=True)
    referred_by_id = Column(BigInteger,
                            ForeignKey("users.user_id"),
                            nullable=True)
    channel_subscription_verified = Column(Boolean, nullable=True)
    channel_subscription_checked_at = Column(DateTime(timezone=True),
                                             nullable=True)
    channel_subscription_verified_for = Column(BigInteger, nullable=True)

    referrer = relationship("User", remote_side=[user_id], backref="referrals")
    subscriptions = relationship("Subscription",
                                 back_populates="user",
                                 cascade="all, delete-orphan")
    payments = relationship("Payment",
                            back_populates="user",
                            cascade="all, delete-orphan")
    promo_code_activations = relationship("PromoCodeActivation",
                                          back_populates="user",
                                          cascade="all, delete-orphan")
    message_logs_authored = relationship("MessageLog",
                                         foreign_keys="MessageLog.user_id",
                                         back_populates="author_user",
                                         cascade="all, delete-orphan")
    message_logs_targeted = relationship(
        "MessageLog",
        foreign_keys="MessageLog.target_user_id",
        back_populates="target_user",
        cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(user_id={self.user_id}, username='{self.username}')>"


class Subscription(Base):
    __tablename__ = "subscriptions"

    subscription_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger,
                     ForeignKey("users.user_id"),
                     nullable=False,
                     index=True)
    panel_user_uuid = Column(String, nullable=False, index=True)
    panel_subscription_uuid = Column(String,
                                     unique=True,
                                     index=True,
                                     nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=False, index=True)
    duration_months = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    status_from_panel = Column(String, nullable=True)
    traffic_limit_bytes = Column(BigInteger, nullable=True)
    traffic_used_bytes = Column(BigInteger, nullable=True)
    last_notification_sent = Column(DateTime(timezone=True), nullable=True)
    provider = Column(String, nullable=True)
    skip_notifications = Column(Boolean, default=False)
    auto_renew_enabled = Column(Boolean, default=True, index=True)

    user = relationship("User", back_populates="subscriptions")

    def __repr__(self):
        return f"<Subscription(id={self.subscription_id}, user_id={self.user_id}, panel_uuid='{self.panel_user_uuid}', ends='{self.end_date}')>"


class Payment(Base):
    __tablename__ = "payments"

    payment_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger,
                     ForeignKey("users.user_id"),
                     nullable=False,
                     index=True)
    yookassa_payment_id = Column(String,
                                 unique=True,
                                 index=True,
                                 nullable=True)
    provider_payment_id = Column(String, unique=True, nullable=True)
    provider = Column(String, nullable=False, default="yookassa", index=True)
    idempotence_key = Column(String, unique=True, nullable=True)
    amount = Column(Float, nullable=False)  # Final amount paid (after discount if any)

    # Discount tracking fields
    original_amount = Column(Float, nullable=True)  # Amount before discount
    discount_applied = Column(Float, nullable=True)  # Discount amount (not percentage)

    currency = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    redirect_url = Column(Text, nullable=True)
    subscription_duration_months = Column(Integer, nullable=True)
    promo_code_id = Column(Integer,
                           ForeignKey("promo_codes.promo_code_id"),
                           nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True),
                        onupdate=func.now(),
                        nullable=True)

    user = relationship("User", back_populates="payments")
    promo_code_used = relationship("PromoCode",
                                   back_populates="payments_where_used")


class UserBilling(Base):
    __tablename__ = "user_billing"

    user_id = Column(BigInteger, ForeignKey("users.user_id"), primary_key=True)
    # Saved payment method for off-session recurring charges (YooKassa)
    yookassa_payment_method_id = Column(String, nullable=True, unique=True)
    card_last4 = Column(String, nullable=True)
    card_network = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    user = relationship("User")

class UserPaymentMethod(Base):
    __tablename__ = "user_payment_methods"

    method_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="yookassa", index=True)
    provider_payment_method_id = Column(String, nullable=False, unique=True, index=True)
    card_last4 = Column(String, nullable=True)
    card_network = Column(String, nullable=True)
    is_default = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    user = relationship("User")
    __table_args__ = (
        UniqueConstraint('user_id', 'provider_payment_method_id', name='uq_user_provider_method'),
    )

class PromoCode(Base):
    __tablename__ = "promo_codes"

    promo_code_id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False, index=True)

    # Type field to distinguish promo code types
    promo_type = Column(String, nullable=False, default="bonus_days", index=True)
    # Values: "bonus_days" or "discount"

    # For bonus_days type: number of days to add to subscription
    bonus_days = Column(Integer, nullable=True)

    # For discount type: percentage discount (1-100)
    discount_percentage = Column(Integer, nullable=True)

    max_activations = Column(Integer, nullable=False)
    current_activations = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_by_admin_id = Column(BigInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    valid_until = Column(DateTime(timezone=True), nullable=True)

    activations = relationship("PromoCodeActivation",
                               back_populates="promo_code",
                               cascade="all, delete-orphan")
    payments_where_used = relationship("Payment",
                                       back_populates="promo_code_used")


class PromoCodeActivation(Base):
    __tablename__ = "promo_code_activations"

    activation_id = Column(Integer, primary_key=True, autoincrement=True)
    promo_code_id = Column(Integer,
                           ForeignKey("promo_codes.promo_code_id"),
                           nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.user_id"), nullable=False)
    activated_at = Column(DateTime(timezone=True), server_default=func.now())
    payment_id = Column(Integer,
                        ForeignKey("payments.payment_id"),
                        nullable=True)

    promo_code = relationship("PromoCode", back_populates="activations")
    user = relationship("User", back_populates="promo_code_activations")
    payment = relationship("Payment")

    __table_args__ = (UniqueConstraint('promo_code_id',
                                       'user_id',
                                       name='uq_promo_user_activation'), )


class ActiveDiscount(Base):
    """Tracks pending discount promo code reservations awaiting payment."""
    __tablename__ = "active_discounts"

    user_id = Column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    promo_code_id = Column(
        Integer,
        ForeignKey("promo_codes.promo_code_id", ondelete="CASCADE"),
        nullable=False,
    )
    discount_percentage = Column(Integer, nullable=False)
    activated_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

    promo_code = relationship("PromoCode")
    user = relationship("User")


class MessageLog(Base):
    __tablename__ = "message_logs"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger,
                     ForeignKey("users.user_id"),
                     nullable=True,
                     index=True)
    telegram_username = Column(String, nullable=True)
    telegram_first_name = Column(String, nullable=True)
    event_type = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=True)
    raw_update_preview = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True),
                       server_default=func.now(),
                       index=True)
    is_admin_event = Column(Boolean, default=False)
    target_user_id = Column(BigInteger,
                            ForeignKey("users.user_id"),
                            nullable=True,
                            index=True)

    author_user = relationship("User",
                               foreign_keys=[user_id],
                               back_populates="message_logs_authored")
    target_user = relationship("User",
                               foreign_keys=[target_user_id],
                               back_populates="message_logs_targeted")


class PanelSyncStatus(Base):
    __tablename__ = "panel_sync_status"

    id = Column(Integer, primary_key=True, default=1, autoincrement=False)
    last_sync_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    users_processed_from_panel = Column(Integer, default=0)
    subscriptions_synced = Column(Integer, default=0)

    __table_args__ = (UniqueConstraint('id'), )


class AdCampaign(Base):
    __tablename__ = "ad_campaigns"

    ad_campaign_id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False, index=True)
    start_param = Column(String, nullable=False, unique=True, index=True)
    cost = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attributions = relationship(
        "AdAttribution",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<AdCampaign(id={self.ad_campaign_id}, source='{self.source}', start_param='{self.start_param}', cost={self.cost})>"


class AdAttribution(Base):
    __tablename__ = "ad_attributions"

    user_id = Column(BigInteger, ForeignKey("users.user_id"), primary_key=True, index=True)
    ad_campaign_id = Column(Integer, ForeignKey("ad_campaigns.ad_campaign_id"), nullable=False, index=True)
    first_start_at = Column(DateTime(timezone=True), server_default=func.now())
    trial_activated_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    campaign = relationship("AdCampaign", back_populates="attributions")


class TrialActivation(Base):
    __tablename__ = "trial_activations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id"), nullable=False, index=True)
    telegram_user_id = Column(BigInteger, nullable=True, index=True)
    site_user_id = Column(BigInteger, nullable=True, index=True)
    source = Column(String(20), nullable=False, index=True)
    activated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reset_at = Column(DateTime(timezone=True), nullable=True, index=True)
    reset_by_admin_id = Column(BigInteger, nullable=True)

    user = relationship("User")
    account = relationship("Account")

    __table_args__ = (
        Index(
            "uq_trial_active_user_id",
            "user_id",
            unique=True,
            postgresql_where=reset_at.is_(None),
        ),
        Index(
            "uq_trial_active_telegram_user_id",
            "telegram_user_id",
            unique=True,
            postgresql_where=telegram_user_id.is_not(None) & reset_at.is_(None),
        ),
        Index(
            "uq_trial_active_site_user_id",
            "site_user_id",
            unique=True,
            postgresql_where=site_user_id.is_not(None) & reset_at.is_(None),
        ),
        Index(
            "uq_trial_active_account_id",
            "account_id",
            unique=True,
            postgresql_where=account_id.is_not(None) & reset_at.is_(None),
        ),
    )


class TrialResetGrant(Base):
    __tablename__ = "trial_reset_grants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id"), nullable=False, index=True)
    telegram_user_id = Column(BigInteger, nullable=True, index=True)
    site_user_id = Column(BigInteger, nullable=True, index=True)
    granted_by_admin_id = Column(BigInteger, nullable=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True, index=True)

    user = relationship("User")
    account = relationship("Account")

    __table_args__ = (
        Index(
            "uq_trial_reset_grant_unused_user_id",
            "user_id",
            unique=True,
            postgresql_where=used_at.is_(None),
        ),
        Index(
            "uq_trial_reset_grant_unused_telegram_user_id",
            "telegram_user_id",
            unique=True,
            postgresql_where=telegram_user_id.is_not(None) & used_at.is_(None),
        ),
        Index(
            "uq_trial_reset_grant_unused_site_user_id",
            "site_user_id",
            unique=True,
            postgresql_where=site_user_id.is_not(None) & used_at.is_(None),
        ),
        Index(
            "uq_trial_reset_grant_unused_account_id",
            "account_id",
            unique=True,
            postgresql_where=account_id.is_not(None) & used_at.is_(None),
        ),
    )


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[_uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telegram_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.user_id"), unique=True, nullable=True, index=True
    )
    site_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.user_id"), unique=True, nullable=True, index=True
    )
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    language_code: Mapped[str] = mapped_column(String(10), default="ru")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    telegram_user = relationship(
        "User",
        foreign_keys=[telegram_user_id],
        backref=backref("account", uselist=False),
        lazy="selectin",
    )
    site_user = relationship("User", foreign_keys=[site_user_id], lazy="selectin")


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[Optional[_uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChannelPost(Base):
    __tablename__ = "channel_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_message_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    channel_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entities_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    media_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    media_file_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reply_markup_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PricingPlan(Base):
    """Time-based subscription pricing plans managed via admin panel."""
    __tablename__ = "pricing_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    price_rub: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price_stars: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class PaymentProviderConfig(Base):
    """Payment provider enable/disable and display order managed via admin panel."""
    __tablename__ = "payment_provider_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class SiteSettings(Base):
    """Single-row table for site customization. Always id=1."""
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1, autoincrement=False)
    brand_name: Mapped[str] = mapped_column(String(100), nullable=False, default="VPN")
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#2AACDF")
    secondary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#897569")
    background_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#F5F1ED")
    foreground_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#2B2B2B")
    card_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#FFFFFF")
    border_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#DDD8D3")
    font_family: Mapped[str] = mapped_column(String(100), nullable=False, default="Nunito")
    custom_css: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    news_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    referral_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    devices_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    privacy_policy_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    terms_of_service_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    personal_data_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    refund_policy_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (UniqueConstraint('id'),)
