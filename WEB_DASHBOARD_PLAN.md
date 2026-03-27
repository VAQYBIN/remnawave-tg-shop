# Raccoonito Shop Web Dashboard — Implementation Plan

## Context

Создаём веб-приложение (личный кабинет) для VPN-сервиса Raccoonito Shop. Сайт дополняет существующий Telegram-бот, позволяя клиентам управлять подписками, оплачивать через все доступные способы (кроме Telegram Stars), просматривать новости канала и управлять устройствами. Авторизация: Telegram Widget + email/пароль.

**Ключевые решения (согласованы с пользователем):**
- Модель данных: таблица `accounts` (bridge) без изменений в `users`
- Вебхуки: бот обрабатывает все платёжные вебхуки, веб поллит статус
- Сервисы: извлечение бизнес-логики в `core/` пакет
- Новости: бот сохраняет → SSE на вебе через Redis Pub/Sub

---

## Технологический стек

| Слой | Технология | context7 ID для документации |
|------|-----------|-------------------------------|
| **Backend API** | FastAPI + Uvicorn | `fastapi` |
| **Frontend** | Vite + React 19 + React Router 7 | `vite`, `react-router` |
| **UI Kit** | Shadcn/ui + Tailwind CSS 4 | `shadcn-ui`, `tailwindcss` |
| **State Management** | TanStack Query (React Query) | `tanstack-react-query` |
| **Auth (JWT)** | PyJWT + bcrypt | `pyjwt` |
| **Email** | Resend Python SDK | `resend` |
| **Cache/Sessions** | Redis 7 (через redis-py async) | `redis-py` |
| **ORM** | SQLAlchemy 2.x async (общая БД с ботом) | `sqlalchemy` |
| **Validation** | Pydantic v2 (schemas) | `pydantic` |
| **HTTP Client** | httpx (для Panel API) | `httpx` |
| **i18n Frontend** | react-i18next | `react-i18next` |
| **Дизайн** | По BRAND_BOOK.md: Nunito, primary #2AACDF, bg #F5F1ED |

> **ВАЖНО**: При реализации каждого компонента использовать `context7` MCP для получения актуальной документации по соответствующей библиотеке.

---

## Архитектура развёртывания

```
                    ┌─────────────────────────────────┐
                    │          Reverse Proxy           │
                    │  (Nginx / Caddy / Traefik)       │
                    └──┬──────────┬──────────┬─────────┘
                       │          │          │
            app.raccoonito.org  api.raccoonito.org  bot webhook URL
                       │          │          │
              ┌────────▼──┐ ┌────▼────┐ ┌───▼──────────┐
              │ Frontend   │ │ Web API │ │ Bot          │
              │ (Nginx+SPA)│ │(FastAPI)│ │ (Aiogram)    │
              │ :3000      │ │ :8090   │ │ :8080        │
              └────────────┘ └────┬────┘ └──┬───────────┘
                                  │         │
                           ┌──────▼─────────▼──────┐
                           │     PostgreSQL 17      │
                           │     (общая БД)         │
                           └────────────────────────┘
                                      │
                           ┌──────────▼────────────┐
                           │      Redis 7           │
                           │  (JWT, кэш, Pub/Sub)   │
                           └────────────────────────┘
```

---

## Структура проекта

```
remnawave-tg-shop/
├── bot/                          # БЕЗ ИЗМЕНЕНИЙ (за исключением channel_post handler и link_email)
│   ├── handlers/
│   │   ├── user/
│   │   │   ├── link_email.py     # НОВЫЙ: привязка email в боте
│   │   │   └── ...
│   │   └── channel_posts.py      # НОВЫЙ: захват постов канала
│   └── ...
│
├── core/                         # НОВЫЙ: общая бизнес-логика
│   ├── __init__.py
│   ├── dal/                      # перенос из db/dal/
│   │   ├── __init__.py
│   │   ├── user_dal.py           # из db/dal/user_dal.py
│   │   ├── account_dal.py        # НОВЫЙ
│   │   ├── subscription_dal.py
│   │   ├── payment_dal.py
│   │   ├── promo_code_dal.py
│   │   ├── active_discount_dal.py
│   │   ├── channel_post_dal.py   # НОВЫЙ
│   │   ├── message_log_dal.py
│   │   ├── panel_sync_dal.py
│   │   ├── user_billing_dal.py
│   │   └── ad_dal.py
│   └── services/
│       ├── __init__.py
│       ├── subscription_core.py  # чистая логика подписок (без Bot/i18n)
│       ├── payment_core.py       # создание платежей через провайдеров
│       ├── referral_core.py      # расчёт бонусов рефералов
│       ├── promo_core.py         # валидация и применение промокодов
│       └── panel_client.py       # HTTP-клиент к Remnawave Panel
│
├── db/
│   ├── models.py                 # + Account, EmailVerificationCode, ChannelPost
│   ├── dal/                      # re-export из core/dal/ для обратной совместимости
│   │   └── __init__.py           # from core.dal import *
│   ├── database_setup.py
│   └── alembic_runner.py
│
├── web/                          # НОВЫЙ: FastAPI backend
│   ├── __init__.py
│   ├── main.py                   # FastAPI app, lifespan, CORS
│   ├── config.py                 # WebSettings (наследует config/settings.py)
│   ├── dependencies.py           # get_db, get_current_user, get_current_account
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── router.py             # POST /auth/*
│   │   ├── jwt_service.py        # создание/валидация JWT, refresh rotation
│   │   ├── telegram_auth.py      # верификация Telegram OIDC id_token (RS256 + JWKS)
│   │   ├── email_service.py      # отправка кодов через Resend
│   │   └── password.py           # bcrypt hash/verify
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── subscription.py       # GET/PATCH /subscription/*
│   │   ├── payment.py            # GET/POST /payments/*
│   │   ├── promo.py              # POST /promo/*
│   │   ├── referral.py           # GET /referral
│   │   ├── profile.py            # GET/PATCH /profile/*
│   │   ├── devices.py            # GET/DELETE /devices/*
│   │   └── news.py               # GET /news/*, SSE stream
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── subscription.py
│   │   ├── payment.py
│   │   ├── promo.py
│   │   ├── referral.py
│   │   ├── profile.py
│   │   ├── device.py
│   │   └── news.py
│   ├── middleware/
│   │   └── rate_limit.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                     # НОВЫЙ: Vite + React SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── components.json           # shadcn config
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── public/
│   │   └── raccoon-logo.webp
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css             # CSS variables из BRAND_BOOK.md
│       ├── api/                  # HTTP-клиент с JWT refresh
│       │   ├── client.ts
│       │   ├── auth.ts
│       │   ├── subscription.ts
│       │   ├── payment.ts
│       │   ├── promo.ts
│       │   ├── referral.ts
│       │   ├── profile.ts
│       │   ├── devices.ts
│       │   └── news.ts
│       ├── auth/
│       │   ├── AuthProvider.tsx
│       │   ├── ProtectedRoute.tsx
│       │   └── useAuth.ts
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── RegisterPage.tsx
│       │   ├── ForgotPasswordPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── SubscriptionPage.tsx
│       │   ├── PaymentHistoryPage.tsx
│       │   ├── PaymentCallbackPage.tsx
│       │   ├── ReferralPage.tsx
│       │   ├── DevicesPage.tsx
│       │   ├── NewsPage.tsx
│       │   └── ProfilePage.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── MobileNav.tsx
│       │   ├── subscription/
│       │   │   ├── SubscriptionCard.tsx
│       │   │   ├── PlanSelector.tsx
│       │   │   └── AutoRenewToggle.tsx
│       │   ├── payment/
│       │   │   ├── PaymentMethodGrid.tsx
│       │   │   └── PromoInput.tsx
│       │   ├── referral/
│       │   │   ├── ReferralStats.tsx
│       │   │   └── ReferralLink.tsx
│       │   ├── news/
│       │   │   ├── NewsFeed.tsx
│       │   │   └── NewsPost.tsx
│       │   └── ui/               # shadcn/ui (генерируются CLI)
│       ├── hooks/
│       │   ├── useSubscription.ts
│       │   ├── usePayments.ts
│       │   └── useNews.ts
│       ├── i18n/
│       │   ├── index.ts
│       │   ├── ru.json
│       │   └── en.json
│       └── lib/
│           └── utils.ts
│
├── config/
│   └── settings.py               # + новые env vars для веба
├── docker-compose.yml            # + redis, web-api, web-frontend
└── .env.example                  # + новые переменные
```

---

## Схема базы данных — изменения

### Новые модели (добавить в `db/models.py`)

```python
# 1. Account — веб-идентификация, bridge к User
class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telegram_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.user_id"), unique=True, nullable=True, index=True
    )
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    language_code: Mapped[str] = mapped_column(String(10), default="ru")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    telegram_user = relationship("User", backref=backref("account", uselist=False), lazy="selectin")


# 2. EmailVerificationCode — коды для регистрации, сброса пароля, смены email
class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    # purpose values: 'register', 'reset_password', 'change_email', 'link_email'
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# 3. ChannelPost — посты из Telegram-канала для ленты новостей
class ChannelPost(Base):
    __tablename__ = "channel_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_message_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    channel_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entities_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON массив entities для форматирования
    media_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # photo, video, document, animation
    media_file_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # кэшированный URL
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### Web-only пользователи и подписки

Когда web-only пользователь (без Telegram) покупает подписку, нужна запись в `users` для FK-совместимости:

1. Создаём PostgreSQL sequence: `CREATE SEQUENCE web_user_id_seq START 9000000000000 INCREMENT 1;`
2. При покупке: `INSERT INTO users (user_id, ...) VALUES (nextval('web_user_id_seq'), ...)`
3. Привязываем `account.telegram_user_id = new_user_id`
4. Telegram ID > 9 трлн не существуют в реальности — коллизий не будет

### Миграция

```bash
alembic revision --autogenerate -m "add web accounts, email verification codes, channel posts"
```

---

## API-эндпоинты

### Аутентификация (`/api/auth/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET  | `/auth/telegram/nonce` | Получить одноразовый nonce для OIDC-запроса | — |
| POST | `/auth/telegram` | Вход через Telegram OIDC (id_token JWT) | — |
| POST | `/auth/register/send-code` | Отправка кода на email | — |
| POST | `/auth/register/verify` | Верификация кода + установка пароля | — |
| POST | `/auth/login` | Вход по email + пароль | — |
| POST | `/auth/password/send-reset-code` | Код сброса пароля на email | — |
| POST | `/auth/password/reset` | Сброс пароля с кодом | — |
| POST | `/auth/refresh` | Обновление access token | Refresh cookie |
| POST | `/auth/logout` | Инвалидация refresh token | Access |

### Профиль (`/api/profile/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/profile` | Данные аккаунта + подписка + юзер | Access |
| PATCH | `/profile/language` | Смена языка | Access |
| POST | `/profile/email/send-code` | Код для смены email | Access |
| POST | `/profile/email/verify` | Подтверждение смены email | Access |
| POST | `/profile/link-telegram` | Привязка Telegram (OIDC id_token) | Access |

### Подписка (`/api/subscription/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/subscription` | Текущая подписка (статус, даты, трафик) | Access |
| GET | `/subscription/plans` | Доступные тарифы и цены | Access |
| GET | `/subscription/connection` | VPN-ссылка из панели | Access |
| PATCH | `/subscription/auto-renew` | Переключение автопродления | Access |

### Платежи (`/api/payments/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/payments` | История платежей (пагинация) | Access |
| POST | `/payments/create` | Создать платёж → redirect URL | Access |
| GET | `/payments/{id}/status` | Статус платежа (для поллинга) | Access |

### Промокоды (`/api/promo/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/promo/apply` | Применить промокод | Access |
| DELETE | `/promo/active-discount` | Отменить зарезервированную скидку | Access |

### Рефералы (`/api/referral/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/referral` | Реферальный код, ссылка, статистика | Access |

### Устройства (`/api/devices/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/devices` | Список подключённых устройств | Access |
| DELETE | `/devices/{hwid}` | Отключить устройство | Access |

### Новости (`/api/news/`)

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/news` | Список постов (пагинация) | Access |
| GET | `/news/stream` | SSE real-time поток | Access |
| GET | `/news/media/{file_id}` | Прокси медиа из Telegram | Access |

### Служебные

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/health` | Health check | — |
| GET | `/config` | Публичный конфиг (support_link, features) | — |

---

## Потоки аутентификации

### 1. Telegram OpenID Connect (OIDC)

**Протокол**: Authorization Code + PKCE, стандарт OpenID Connect
**Документация**: https://core.telegram.org/bots/telegram-login
**OIDC Discovery**: https://oauth.telegram.org/.well-known/openid-configuration

```
Браузер:
  1. GET /api/auth/telegram/nonce
     ← { nonce: "abc123" }  (сохранить в Redis с TTL 5 мин)

  2. Telegram.Login.auth({ client_id, nonce, request_access: ['write'] }, callback)
     → Telegram popup → пользователь подтверждает
     ← callback({ id_token: "eyJ..." })   (JWT, подписан RS256)

  3. POST /api/auth/telegram { id_token, nonce }

Бэкенд:
  → Fetch JWKS: GET https://oauth.telegram.org/.well-known/jwks.json (кэш 1 ч)
  → Верификация id_token:
      - Подпись RS256 через публичный ключ из JWKS (kid matching)
      - iss == "https://oauth.telegram.org"
      - aud == TELEGRAM_CLIENT_ID
      - exp > now
      - nonce из токена == nonce из Redis → удалить из Redis
  → Извлечь telegram_user_id из payload.id (int) или payload.sub
  → Найти/создать Account по telegram_user_id
  → Выдать JWT пару (access + refresh)
  → Refresh в HttpOnly cookie, access в теле ответа
```

**Токен Telegram**: JWT с RS256, claims: `iss`, `aud`, `sub` (string), `id` (int),
`name`, `preferred_username`, `picture`, `exp`, `iat`, `nonce`

**Нет UserInfo endpoint** — все данные в id_token.

### 2. Email-регистрация

```
1. POST /auth/register/send-code { email }
   → Проверить: email не занят
   → Сгенерировать 6-значный код, сохранить в email_verification_codes (TTL 10 мин)
   → Отправить через Resend
   → Ответ: { success: true }

2. POST /auth/register/verify { email, code, password }
   → Проверить код (не истёк, не использован)
   → Создать Account (email, bcrypt(password), is_email_verified=true)
   → Пометить код как использованный
   → Выдать JWT пару
```

### 3. Email-логин

```
POST /auth/login { email, password }
→ Найти Account по email
→ bcrypt.verify(password, account.password_hash)
→ Выдать JWT пару
```

### 4. Сброс пароля

```
1. POST /auth/password/send-reset-code { email }
   → Найти Account → отправить код через Resend

2. POST /auth/password/reset { email, code, new_password }
   → Проверить код → обновить password_hash
```

### 5. Привязка email в боте

```
Бот: /link_email → FSM
→ Пользователь вводит email
→ Бот отправляет код через Resend (через core/services/)
→ Пользователь вводит код
→ Бот создаёт/обновляет Account: email + telegram_user_id + is_email_verified=true
→ Теперь можно входить на сайт через email
```

### 6. Привязка Telegram на сайте

```
POST /api/profile/link-telegram { id_token }
→ Верифицировать id_token (JWKS, iss, aud, exp) — без nonce (уже авторизован)
→ Извлечь telegram_user_id из payload.id
→ Найти существующий User по telegram_user_id
  → Если есть User с другим Account → merge (объединить данные)
  → Если есть User без Account → привязать к текущему Account
  → Если нет User → создать User, привязать к Account
```

---

## Поток оплаты на сайте

```
1. Фронтенд: выбор тарифа + провайдера + промокод (опционально)

2. POST /api/payments/create {
     provider: "yookassa",
     duration_months: 3,
     promo_code: "SUMMER2024"  // опционально
   }

3. Бэкенд:
   a. Валидация промокода (через core/services/promo_core.py)
   b. Расчёт суммы (Settings.subscription_options + скидка)
   c. Создание Payment записи (status: pending_{provider})
   d. Вызов API провайдера (через core/services/payment_core.py)
   e. return_url = "https://app.raccoonito.org/payment/callback?payment_id={id}"

4. Ответ: { payment_id, redirect_url }

5. Фронтенд: window.location.href = redirect_url

6. Пользователь оплачивает на сайте провайдера

7. Провайдер → webhook → БОТ-контейнер → обновляет Payment и активирует подписку

8. Пользователь возвращается на /payment/callback?payment_id={id}
   Фронтенд поллит GET /api/payments/{id}/status каждые 2 секунды
   Когда status=succeeded → показать экран успеха
```

---

## Реализация новостной ленты

### Бот-сторона

Новый хендлер `bot/handlers/channel_posts.py`:
- Ловит `channel_post` обновления от Aiogram
- Фильтрует по `NEWS_CHANNEL_ID` (новая env variable)
- Сохраняет в `channel_posts` таблицу через `core/dal/channel_post_dal.py`
- Публикует в Redis: `PUBLISH news:new_post {post_id}`

### Веб-API

- `GET /api/news?page=1&limit=20` — пагинация из БД
- `GET /api/news/stream` — SSE эндпоинт:
  - Подписывается на Redis `SUBSCRIBE news:new_post`
  - При получении сообщения — читает пост из БД и отправляет клиенту
- `GET /api/news/media/{file_id}` — проксирует через Telegram Bot API `getFile`
  - Кэширует URL в Redis на 1 час

### Фронтенд

- `NewsPage.tsx` с `NewsFeed` и `NewsPost` компонентами
- `EventSource` для SSE — автоматически prepend новых постов
- Медиа отображается inline (фото, видео)

---

## Новые переменные окружения

Добавить в `config/settings.py` и `.env.example`:

```python
# === Web Dashboard ===
WEB_JWT_SECRET: str                        # Обязательно для JWT
WEB_JWT_ACCESS_EXPIRE_MINUTES: int = 15
WEB_JWT_REFRESH_EXPIRE_DAYS: int = 7

REDIS_URL: str = "redis://localhost:6379/0"

RESEND_API_KEY: Optional[str] = None       # Для отправки email
RESEND_FROM_EMAIL: str = "noreply@raccoonito.org"

WEB_FRONTEND_URL: str = "https://app.raccoonito.org"
WEB_API_URL: str = "https://api.raccoonito.org"

NEWS_CHANNEL_ID: Optional[int] = None      # Telegram channel для новостей

WEB_CORS_ORIGINS: str = "https://app.raccoonito.org"  # через запятую

# === Telegram OIDC ===
# Получить в @BotFather → Bot Settings → Web Login
TELEGRAM_CLIENT_ID: Optional[int] = None   # Числовой ID бота (= bot_id, не токен)
TELEGRAM_CLIENT_SECRET: Optional[str] = None  # Секрет из BotFather (для token exchange если нужен)
# TELEGRAM_JWKS_URI (не нужен в .env — фиксированный: https://oauth.telegram.org/.well-known/jwks.json)
```

**Фронтенд build args** (Docker + `.env`):
```
VITE_BOT_CLIENT_ID=123456789     # Числовой ID бота для telegram-login.js
VITE_API_URL=https://api.raccoonito.org/api
```

---

## Docker Compose — дополнения

```yaml
services:
  # ... существующие remnawave-tg-shop и remnawave-tg-shop-db ...

  redis:
    image: redis:7-alpine
    container_name: remnawave-redis
    networks: [remnawave-network]
    volumes: ['redis-data:/data']
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  web-api:
    build:
      context: .
      dockerfile: web/Dockerfile
    container_name: remnawave-web-api
    env_file: .env
    networks: [remnawave-network]
    ports: ['8090:8090']
    restart: unless-stopped
    depends_on:
      remnawave-tg-shop-db: { condition: service_healthy }
      redis: { condition: service_healthy }

  web-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: remnawave-web-frontend
    networks: [remnawave-network]
    ports: ['3000:80']
    restart: unless-stopped

volumes:
  redis-data:
```

---

## Фронтенд — роутинг

```
/login              → LoginPage (Telegram Widget + email form)
/register           → RegisterPage (email → код → пароль)
/forgot-password    → ForgotPasswordPage (email → код → новый пароль)
/dashboard          → DashboardPage (обзор: подписка + быстрые действия)
/subscription       → SubscriptionPage (тарифы, покупка, VPN-ссылка)
/payment/callback   → PaymentCallbackPage (ожидание + результат)
/payments           → PaymentHistoryPage (таблица платежей)
/referral           → ReferralPage (код, ссылка, статистика)
/devices            → DevicesPage (список + отключение)
/news               → NewsPage (лента + SSE)
/profile            → ProfilePage (email, язык, привязки)
```

### CSS Variables (из BRAND_BOOK.md → `frontend/src/index.css`)

```css
:root {
  --primary: 197 74% 52%;          /* #2AACDF */
  --primary-foreground: 0 0% 100%; /* white */
  --background: 40 11% 95%;        /* #F5F1ED */
  --foreground: 0 0% 17%;          /* #2B2B2B */
  --card: 0 0% 100%;               /* #FFFFFF */
  --secondary: 27 14% 48%;         /* #897569 */
  --muted: 40 8% 90%;              /* #E8E4DF */
  --muted-foreground: 0 0% 40%;    /* #666666 */
  --border: 30 8% 85%;             /* #DDD8D2 */
  --radius: 0.5rem;
  font-family: 'Nunito', sans-serif;
}
```

---

## Фазы реализации

### Правило: Ручная проверка после каждой фазы

> **ОБЯЗАТЕЛЬНО:** После завершения каждой фазы — полная остановка для ручной проверки.
> Не переходить к следующей фазе, пока текущая не проверена и не подтверждена.
> Это предотвращает накопление ошибок, которые потом сложно отлаживать.
>
> Формат проверки для каждой фазы описан в блоке **"Контрольная проверка"**.

---

### Фаза 1: Фундамент
**Цель**: скелет проекта, БД, базовая инфраструктура

1. Создать `core/dal/` — перенести DAL из `db/dal/`, обновить импорты в боте (re-export)
2. Создать `core/services/` — извлечь чистую бизнес-логику из bot/services/
   - `subscription_core.py` из `bot/services/subscription_service.py`
   - `payment_core.py` из payment-сервисов
   - `referral_core.py` из `bot/services/referral_service.py`
   - `promo_core.py` из `bot/services/promo_code_service.py`
   - `panel_client.py` из `bot/services/panel_api_service.py`
3. Добавить модели `Account`, `EmailVerificationCode`, `ChannelPost` в `db/models.py`
4. Создать Alembic миграцию
5. Добавить новые env vars в `config/settings.py`
6. Настроить FastAPI skeleton (`web/main.py`) с health check, CORS, DB session dependency
7. Настроить Redis подключение
8. Docker compose: добавить redis, web-api, web-frontend
9. Создать `web/Dockerfile` и `frontend/Dockerfile`

**context7**: `fastapi`, `sqlalchemy`, `redis-py`, `pydantic`

**Контрольная проверка Фазы 1:**
- [ ] Бот запускается без ошибок после рефакторинга импортов (`python main.py` или `docker compose up`)
- [ ] `core/dal/` содержит все DAL-модули, `db/dal/` re-export работает
- [ ] Alembic миграция применяется: таблицы `accounts`, `email_verification_codes`, `channel_posts` созданы
- [ ] `GET http://localhost:8090/api/health` возвращает 200
- [ ] Redis подключение работает (проверить в логах web-api)
- [ ] Docker compose поднимает все 5 сервисов (bot, db, redis, web-api, web-frontend)

---

### Фаза 2: Аутентификация
**Цель**: полный auth flow — все 3 метода входа

1. JWT сервис (`web/auth/jwt_service.py`) — access + refresh, Redis для revocation ✅
2. Telegram OIDC верификация (`web/auth/telegram_auth.py`):
   - `GET /auth/telegram/nonce` — генерация nonce, хранение в Redis
   - Верификация `id_token` через JWKS (RS256, kid matching, кэш ключей 1 ч)
   - Проверка: `iss`, `aud == TELEGRAM_CLIENT_ID`, `exp`, `nonce`
   - Требует пакет `cryptography` (PyJWT RS256 backend)
3. Email сервис через Resend (`web/auth/email_service.py`) ✅
4. Bcrypt хеширование (`web/auth/password.py`) ✅
5. Все auth эндпоинты (`web/auth/router.py`) ✅
6. `get_current_account` dependency для защищённых маршрутов ✅
7. Rate limiting на auth эндпоинтах ✅
8. Фронтенд: Vite + React + React Router + UI компоненты setup ✅
9. Фронтенд: LoginPage (с `Telegram.Login.auth()` из `telegram-login.js`), RegisterPage, ForgotPasswordPage ✅
10. Фронтенд: AuthProvider, ProtectedRoute, API client с auto-refresh ✅

**context7**: `pyjwt`, `resend`, `vite`, `react-router`, `shadcn-ui`, `tailwindcss`

**Контрольная проверка Фазы 2:**
- [ ] Регистрация через email: код приходит на почту, аккаунт создаётся в БД ✅
- [ ] Вход по email + пароль: access token возвращается, refresh в cookie ✅
- [ ] Вход через Telegram OIDC: popup → id_token верифицируется → JWT выдаётся
- [ ] Refresh token: `POST /auth/refresh` выдаёт новый access token ✅
- [ ] Logout: refresh token инвалидируется в Redis ✅
- [ ] Сброс пароля: код на email → новый пароль работает ✅
- [ ] Защищённый эндпоинт отклоняет запросы без/с невалидным JWT ✅
- [ ] Фронтенд: страницы Login, Register, ForgotPassword отображаются корректно ✅
- [ ] Фронтенд: после логина — редирект на /dashboard ✅
- [ ] Фронтенд: без токена — редирект на /login ✅

---

### Фаза 3: Dashboard + Подписки
**Цель**: основной личный кабинет

1. `GET /api/profile` — данные аккаунта + юзера + текущая подписка
2. `GET /api/subscription` — детали подписки (из БД + panel sync)
3. `GET /api/subscription/plans` — тарифы из Settings
4. `GET /api/subscription/connection` — VPN-ссылка (panel API)
5. `PATCH /api/subscription/auto-renew` — автопродление
6. `GET /api/payments` — история (пагинация)
7. Фронтенд: AppShell (sidebar + mobile nav), DashboardPage, SubscriptionPage, PaymentHistoryPage
8. TanStack Query для data fetching и кэширования

**context7**: `tanstack-react-query`, `shadcn-ui`

**Контрольная проверка Фазы 3:**
- [ ] `GET /api/profile` возвращает данные аккаунта, включая подписку (или null)
- [ ] `GET /api/subscription/plans` возвращает тарифы из Settings
- [ ] `GET /api/subscription/connection` возвращает VPN-ссылку (для пользователя с подпиской)
- [ ] `PATCH /api/subscription/auto-renew` переключает флаг в БД
- [ ] `GET /api/payments` возвращает историю с пагинацией
- [ ] Фронтенд: sidebar навигация работает, mobile nav отображается на узких экранах
- [ ] Фронтенд: DashboardPage показывает карточку подписки или предложение купить
- [ ] Фронтенд: данные загружаются через TanStack Query (видно в DevTools)

---

### Фаза 4: Платежи
**Цель**: полный платёжный flow на сайте

1. `POST /api/payments/create` — создание платежа через провайдер, return redirect URL
2. `GET /api/payments/{id}/status` — поллинг статуса
3. `POST /api/promo/apply` — применение промокода
4. Фронтенд: PlanSelector, PaymentMethodGrid, PromoInput
5. Фронтенд: PaymentCallbackPage (поллинг + результат)

**context7**: `fastapi`, `httpx`

**Контрольная проверка Фазы 4:**
- [ ] `POST /api/payments/create` возвращает `redirect_url` для каждого активного провайдера
- [ ] Payment record создаётся в БД со статусом `pending_{provider}`
- [ ] `GET /api/payments/{id}/status` корректно отражает текущий статус
- [ ] Промокод применяется: скидка рассчитывается, `active_discounts` создаётся
- [ ] Фронтенд: выбор тарифа → выбор провайдера → редирект на провайдера работает
- [ ] Фронтенд: PaymentCallbackPage поллит статус и показывает результат
- [ ] **End-to-end**: оплата через тестовый режим провайдера → бот получает webhook → статус на сайте обновляется

---

### Фаза 5: Фичи
**Цель**: рефералы, устройства, профиль, привязка аккаунтов

1. `GET /api/referral` — код, ссылка, статистика
2. `GET /api/devices` + `DELETE /api/devices/{hwid}` — управление устройствами
3. `PATCH /api/profile/language` — смена языка
4. `POST /api/profile/email/send-code` + `verify` — смена email
5. `POST /api/profile/link-telegram` — привязка Telegram на сайте
6. Бот: `/link_email` команда для привязки email
7. Фронтенд: ReferralPage, DevicesPage, ProfilePage

**context7**: `react-i18next`

**Контрольная проверка Фазы 5:**
- [ ] `GET /api/referral` возвращает реферальный код и статистику
- [ ] `GET /api/devices` возвращает список устройств из панели
- [ ] `DELETE /api/devices/{hwid}` отключает устройство
- [ ] Смена email: код приходит → email обновляется в аккаунте
- [ ] Привязка Telegram на сайте: аккаунты объединяются корректно
- [ ] Бот: `/link_email` привязывает email, после чего можно войти на сайт по email
- [ ] Фронтенд: все страницы (Referral, Devices, Profile) отображаются и функционируют

---

### Фаза 6: Новостная лента
**Цель**: посты из Telegram-канала в real-time

1. Бот: `channel_posts.py` хендлер — захват постов в БД + Redis PUBLISH
2. `GET /api/news` — пагинация
3. `GET /api/news/stream` — SSE
4. `GET /api/news/media/{file_id}` — прокси медиа
5. Фронтенд: NewsPage, NewsFeed, NewsPost с EventSource

**context7**: `fastapi` (SSE/StreamingResponse)

**Контрольная проверка Фазы 6:**
- [ ] Отправить пост в Telegram-канал → запись появляется в `channel_posts`
- [ ] `GET /api/news` возвращает посты с пагинацией
- [ ] `GET /api/news/stream` (SSE): при новом посте клиент получает событие
- [ ] Медиа-прокси: фото/видео из постов отображаются на сайте
- [ ] Фронтенд: NewsPage показывает ленту, новые посты появляются в real-time

---

### Фаза 7: Полировка
**Цель**: качество, безопасность, production-readiness

1. i18n для фронтенда (ru/en JSON файлы)
2. Mobile-responsive тестирование
3. Проверка соответствия BRAND_BOOK.md
4. Security audit (CSRF, XSS, JWT storage, input validation)
5. Error boundaries + toast уведомления на фронтенде
6. Production конфигурация (SSL, домены, env-файлы)

**Контрольная проверка Фазы 7:**
- [ ] Переключение ru/en работает на всех страницах
- [ ] Mobile view: все страницы корректно отображаются на 375px, 414px, 768px
- [ ] Цвета, шрифты, скругления соответствуют BRAND_BOOK.md
- [ ] Нет XSS-уязвимостей (проверить user input в новостях, профиле)
- [ ] JWT хранится корректно (access в памяти, refresh в HttpOnly cookie)
- [ ] Error boundaries ловят ошибки, toast уведомления показываются
- [ ] Docker compose с production-конфигом поднимается без ошибок

---

## Верификация и тестирование

### Backend
1. Запуск: `docker compose up -d` → проверить `GET /api/health` возвращает 200
2. Auth: зарегистрироваться через email → получить JWT → вызвать защищённый эндпоинт
3. Auth: войти через Telegram Widget → проверить автосоздание аккаунта
4. Платежи: создать тестовый платёж → проверить redirect URL → проверить поллинг статуса
5. Подписки: после успешной оплаты → `GET /api/subscription` показывает активную подписку
6. Новости: отправить пост в канал → проверить появление в `GET /api/news` и SSE

### Frontend
1. `npm run dev` → открыть `localhost:5173`
2. Проверить все маршруты: login → register → dashboard → subscription → payments → referral → devices → news → profile
3. Проверить mobile view (Chrome DevTools)
4. Проверить переключение языков ru/en

### Интеграция
1. Зарегистрироваться на сайте по email
2. В боте привязать email → проверить что данные синхронизированы
3. Купить подписку на сайте → проверить что бот обработал webhook
4. Войти через Telegram Widget → проверить доступ к подписке

---

## Критические файлы для модификации

| Файл | Изменение |
|------|-----------|
| `db/models.py` | Добавить Account, EmailVerificationCode, ChannelPost |
| `config/settings.py` | Добавить WEB_JWT_*, REDIS_URL, RESEND_*, NEWS_CHANNEL_ID и др. |
| `.env.example` | Добавить все новые переменные |
| `docker-compose.yml` | Добавить redis, web-api, web-frontend |
| `db/dal/__init__.py` | Re-export из core/dal/ |
| `bot/services/subscription_service.py` | Извлечь core-логику в core/services/ |
| `bot/services/referral_service.py` | Извлечь core-логику |
| `bot/services/panel_api_service.py` | Извлечь в core/services/panel_client.py |

## Существующие функции для переиспользования

| Функция | Файл | Использование на вебе |
|---------|------|----------------------|
| `create_payment_record()` | `db/dal/payment_dal.py` | Создание записи о платеже |
| `get_active_subscription_by_user_id()` | `db/dal/subscription_dal.py` | Получение текущей подписки |
| `apply_promo_code()` | `bot/services/promo_code_service.py` → `core/services/promo_core.py` | Применение промокодов |
| `get_referral_stats()` | `bot/services/referral_service.py` → `core/services/referral_core.py` | Статистика рефералов |
| `create_panel_user()` | `bot/services/panel_api_service.py` → `core/services/panel_client.py` | Создание пользователя в панели |
| `get_subscription_link()` | `bot/services/panel_api_service.py` → `core/services/panel_client.py` | Ссылка на подключение VPN |
| `get_user_devices()` | `bot/services/panel_api_service.py` → `core/services/panel_client.py` | Список устройств |
| `ensure_referral_code()` | `db/dal/user_dal.py` | Генерация реферального кода |
