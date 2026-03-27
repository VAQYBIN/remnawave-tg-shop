# Raccoonito Shop Web Dashboard — Checklist

> Пошаговый чек-лист реализации. Каждый пункт — конкретное действие.
> Отмечай `[x]` по мере выполнения. **Не переходи к следующей фазе без проверки текущей.**

---

## ФАЗА 1: Фундамент

### 1.1 Извлечение core/dal/
- [x] Создать директорию `core/dal/` с `__init__.py`
- [x] Скопировать `db/dal/user_dal.py` → `core/dal/user_dal.py`
- [x] Скопировать `db/dal/subscription_dal.py` → `core/dal/subscription_dal.py`
- [x] Скопировать `db/dal/payment_dal.py` → `core/dal/payment_dal.py`
- [x] Скопировать `db/dal/promo_code_dal.py` → `core/dal/promo_code_dal.py`
- [x] Скопировать `db/dal/active_discount_dal.py` → `core/dal/active_discount_dal.py`
- [x] Скопировать `db/dal/message_log_dal.py` → `core/dal/message_log_dal.py`
- [x] Скопировать `db/dal/panel_sync_dal.py` → `core/dal/panel_sync_dal.py`
- [x] Скопировать `db/dal/user_billing_dal.py` → `core/dal/user_billing_dal.py`
- [x] Скопировать `db/dal/ad_dal.py` → `core/dal/ad_dal.py`
- [x] Создать `core/dal/account_dal.py` (НОВЫЙ — CRUD для Account)
- [x] Создать `core/dal/channel_post_dal.py` (НОВЫЙ — CRUD для ChannelPost)
- [x] Обновить `db/dal/__init__.py` на re-export из `core/dal`
- [x] **ПРОВЕРКА**: бот запускается без ошибок с новыми импортами

### 1.2 Извлечение core/services/
- [x] Создать `core/services/__init__.py`
- [x] Извлечь `core/services/panel_client.py` из `bot/services/panel_api_service.py` (чистый HTTP-клиент, без Bot/i18n)
- [x] Извлечь `core/services/subscription_core.py` из `bot/services/subscription_service.py` (логика активации, расчёт дат)
- [x] Извлечь `core/services/payment_core.py` из payment-сервисов (заглушка, Phase 4)
- [x] Извлечь `core/services/referral_core.py` из `bot/services/referral_service.py` (расчёт бонусов)
- [x] Извлечь `core/services/promo_core.py` из `bot/services/promo_code_service.py` (валидация, применение)
- [x] Обновить bot/services/ — импортировать из core/ вместо дублирования
- [x] **ПРОВЕРКА**: бот запускается и основные функции работают

### 1.3 Модели БД
- [x] Добавить модель `Account` в `db/models.py` (UUID PK, email, password_hash, telegram_user_id FK)
- [x] Добавить модель `EmailVerificationCode` в `db/models.py`
- [x] Добавить модель `ChannelPost` в `db/models.py`
- [x] Создать Alembic миграцию: `alembic revision --autogenerate -m "add web accounts, email verification codes, channel posts"` → `bcfe200c3b63`
- [x] Применить миграцию: `alembic upgrade head`
- [x] **ПРОВЕРКА**: таблицы `accounts`, `email_verification_codes`, `channel_posts` видны в БД

### 1.4 Конфигурация
- [x] Добавить в `config/settings.py`: WEB_JWT_SECRET, WEB_JWT_ACCESS_EXPIRE_MINUTES, WEB_JWT_REFRESH_EXPIRE_DAYS
- [x] Добавить: REDIS_URL, RESEND_API_KEY, RESEND_FROM_EMAIL
- [x] Добавить: WEB_FRONTEND_URL, WEB_API_URL, NEWS_CHANNEL_ID, WEB_CORS_ORIGINS
- [x] Обновить `.env.example` с новыми переменными
- [x] **ПРОВЕРКА**: `Settings()` загружается без ошибок с новыми полями

### 1.5 FastAPI skeleton
- [x] Создать `web/__init__.py`
- [x] Создать `web/main.py` — FastAPI app с lifespan, CORS
- [x] Создать `web/config.py` — WebSettings (использует config/settings.py)
- [x] Создать `web/dependencies.py` — `get_db()`, `get_settings_dep()`
- [x] Реализовать `GET /api/health` — возвращает 200
- [x] Настроить CORS middleware (origins из WEB_CORS_ORIGINS)
- [x] Настроить Redis подключение (redis-py async) *(Phase 2 — нужен для JWT)*
- [x] Создать `web/requirements.txt` (fastapi, uvicorn, redis, pyjwt, bcrypt, resend, httpx, pydantic)
- [x] **ПРОВЕРКА**: `uvicorn web.main:app` запускается, `/api/health` отвечает *(требует Docker)*

### 1.6 Docker
- [x] Создать `web/Dockerfile` (Python 3.12-slim, uvicorn)
- [x] Создать `frontend/Dockerfile` (Node 20 build → Nginx serve)
- [x] Создать `frontend/nginx.conf` (SPA fallback на index.html)
- [x] Обновить `docker-compose.yml` — добавить сервисы: redis, web-api, web-frontend
- [x] **ПРОВЕРКА**: `docker compose up -d` поднимает все 5 сервисов без ошибок

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 1
- [x] Бот работает как раньше (ничего не сломано)
- [x] `GET http://localhost:8090/api/health` → 200
- [x] Таблицы accounts, email_verification_codes, channel_posts в БД
- [x] Redis отвечает на ping
- [x] Все 5 контейнеров запущены и healthy

---

## ФАЗА 2: Аутентификация

### 2.1 Backend — JWT
- [x] Создать `web/auth/__init__.py`
- [x] Создать `web/auth/jwt_service.py` — create_access_token, create_refresh_token, verify_token
- [x] Refresh token хранится в Redis с TTL (7 дней)
- [x] Rotation: при refresh — старый токен инвалидируется, выдаётся новый
- [x] Revocation: при logout — refresh token удаляется из Redis
- [x] **ПРОВЕРКА**: юнит-тест — создать JWT, верифицировать, проверить expiry

### 2.2 Backend — Telegram OIDC Auth
> Реализован **Authorization Code + PKCE** (RFC 7636) — лучше nonce: нет серверного состояния, CSRF защита через `state`.
> Документация: https://core.telegram.org/bots/telegram-login
- [x] Добавить в `config/settings.py`: `TELEGRAM_OIDC_CLIENT_SECRET` (из BotFather OAuth Settings); `telegram_client_id` — computed из BOT_TOKEN
- [x] `PyJWT[crypto]>=2.8.0` в `web/requirements.txt` — включает `cryptography` для RS256
- [x] Переписать `web/auth/telegram_auth.py`:
  - [x] `exchange_code_for_tokens(code, code_verifier, redirect_uri, bot_id, client_secret)` — PKCE token exchange
  - [x] `_fetch_jwks()` — async fetch `https://oauth.telegram.org/.well-known/jwks.json`
  - [x] `verify_id_token(id_token, bot_id)` — kid matching + RS256 verify (iss, aud, exp)
  - [x] `extract_telegram_user_id(claims)` — берёт `id`/`telegram_id` из claims (sub — uint64, не влезает в BIGINT)
- [x] `GET /auth/telegram/config` — возвращает `client_id` (числовой ID бота) для фронтенда
- [x] `POST /auth/telegram` — принимает `{code, code_verifier, redirect_uri}` (TelegramCallbackRequest)
- [x] Обновить schema `TelegramCallbackRequest` в `web/schemas/auth.py`
- [x] Фронтенд `LoginPage.tsx`: кнопка генерирует PKCE пару (Web Crypto API, S256) + state → redirect на `oauth.telegram.org`
- [x] Создать `src/pages/TelegramCallbackPage.tsx` — обрабатывает `?code=&state=`, верифицирует state, POST `/api/auth/telegram`
- [x] Добавить маршрут `/auth/telegram/callback` в `App.tsx`
- [x] **ПРОВЕРКА**: Telegram → redirect → callback → id_token верифицируется → аккаунт создаётся → JWT ✅ (проверено 2026-03-26)

### 2.3 Backend — Email сервис
- [x] Создать `web/auth/email_service.py` — send_verification_code(email, code, purpose)
- [x] Подключить Resend SDK
- [x] Шаблоны писем: регистрация, сброс пароля, смена email, привязка email
- [x] **ПРОВЕРКА**: отправить тестовое письмо через Resend → приходит

### 2.4 Backend — Password
- [x] Создать `web/auth/password.py` — hash_password(plain), verify_password(plain, hashed)
- [x] Использовать bcrypt с cost factor 12
- [x] **ПРОВЕРКА**: хеш создаётся и верифицируется

### 2.5 Backend — Auth эндпоинты
- [x] Создать `web/schemas/auth.py` — Pydantic v2 schemas для всех auth запросов/ответов
- [x] Создать `web/auth/router.py` с маршрутами:
  - [x] `GET /auth/telegram/config` — возвращает client_id для PKCE flow (nonce не нужен)
  - [x] `POST /auth/telegram` — вход через Telegram OIDC (Authorization Code + PKCE)
  - [x] `POST /auth/register/send-code` — отправка кода на email
  - [x] `POST /auth/register/verify` — верификация кода + создание аккаунта
  - [x] `POST /auth/login` — вход по email + пароль
  - [x] `POST /auth/password/send-reset-code` — код сброса
  - [x] `POST /auth/password/reset` — сброс пароля
  - [x] `POST /auth/refresh` — обновление access token
  - [x] `POST /auth/logout` — инвалидация refresh token
- [x] Создать `web/dependencies.py: get_current_account()` — FastAPI Depends для защищённых маршрутов
- [x] Rate limiting на auth эндпоинтах (Redis-based) — `web/middleware/rate_limit.py`
- [x] **ПРОВЕРКА**: все эндпоинты отвечают через Swagger UI (/docs)

### 2.6 Frontend — Setup
- [x] Инициализировать `frontend/` — Vite + React + TypeScript
- [x] Установить React Router 7
- [x] Установить и настроить Tailwind CSS 4
- [x] Установить и настроить UI компоненты (Button, Card, Input, Badge) в `src/components/ui/`
- [x] Создать `frontend/src/index.css` с CSS variables из brand book
- [x] Подключить шрифт Nunito (Google Fonts)
- [x] Создать базовые компоненты: Button, Card, Input, Badge
- [x] **ПРОВЕРКА**: `npm run dev` → страница отображается с корректными стилями

### 2.7 Frontend — Auth pages
- [x] Создать `src/api/client.ts` — HTTP-клиент (fetch) с auto-refresh JWT
- [x] Создать `src/api/auth.ts` — функции для всех auth эндпоинтов
- [x] Создать `src/auth/AuthProvider.tsx` — React Context для auth state
- [x] Создать `src/auth/useAuth.ts` — хук для доступа к auth
- [x] Создать `src/auth/ProtectedRoute.tsx` — редирект на /login без токена
- [x] Создать `src/pages/LoginPage.tsx` — Telegram Widget + email form
- [x] Создать `src/pages/RegisterPage.tsx` — email → код → пароль
- [x] Создать `src/pages/ForgotPasswordPage.tsx` — email → код → новый пароль
- [x] Настроить React Router: маршруты /login, /register, /forgot-password, /dashboard
- [x] **ПРОВЕРКА**: полный flow регистрации и входа работает в браузере

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 2
- [x] Регистрация по email → код на почту → аккаунт в БД
- [x] Вход по email + пароль → JWT → защищённый запрос проходит
- [x] Telegram OIDC → redirect → id_token верифицируется → аккаунт создаётся → JWT
- [x] Refresh → новый access token
- [x] Logout → refresh инвалидирован
- [x] Сброс пароля → новый пароль работает
- [x] Фронтенд: Login → Register → ForgotPassword корректно отображаются
- [x] Без JWT → редирект на /login
- [x] После логина → редирект на /dashboard

✅ **ФАЗА 2 ЗАВЕРШЕНА** (2026-03-26)

---

## ФАЗА 3: Dashboard + Подписки

### 3.1 Backend — Profile & Subscription
- [x] Создать `web/schemas/subscription.py` и `web/schemas/profile.py`
- [x] Создать `web/routers/profile.py`:
  - [x] `GET /api/profile` — данные аккаунта + юзера + подписка
- [x] Создать `web/routers/subscription.py`:
  - [x] `GET /api/subscription` — текущая подписка (статус, даты, трафик)
  - [x] `GET /api/subscription/plans` — тарифы из Settings
  - [x] `GET /api/subscription/connection` — VPN-ссылка из панели
  - [x] `PATCH /api/subscription/auto-renew` — переключение автопродления
- [x] Создать `web/routers/payment.py`:
  - [x] `GET /api/payments` — история платежей (пагинация)
- [x] **ПРОВЕРКА**: все эндпоинты отвечают корректными данными

### 3.2 Frontend — Dashboard UI
- [x] Создать `src/components/layout/AppShell.tsx` — sidebar + main content area
- [x] Создать `src/components/layout/Sidebar.tsx` — навигация по разделам
- [x] Создать `src/components/layout/MobileNav.tsx` — мобильная навигация
- [x] Установить и настроить TanStack Query (уже в package.json, подключён в main.tsx)
- [x] Создать `src/api/subscription.ts`, `src/api/profile.ts`, `src/api/payment.ts`
- [x] Создать `src/pages/DashboardPage.tsx` — обзорная страница (подписка + быстрые действия)
- [x] Создать `src/components/subscription/SubscriptionCard.tsx` — карточка текущей подписки
- [x] Создать `src/pages/SubscriptionPage.tsx` — тарифы, VPN-ссылка, автопродление
- [x] Создать `src/pages/PaymentHistoryPage.tsx` — таблица платежей
- [x] **ПРОВЕРКА**: dashboard отображается, данные загружаются, mobile nav работает

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 3
- [x] GET /api/profile возвращает полные данные
- [x] GET /api/subscription/plans показывает тарифы
- [x] Автопродление переключается
- [x] Фронтенд: sidebar, dashboard, subscription, payment history работают
- [x] Mobile: навигация и все страницы адаптивны

✅ **ФАЗА 3 ЗАВЕРШЕНА** (2026-03-28)

---

## ФАЗА 4: Платежи

### 4.1 Backend — Payment flow
- [x] Создать `web/schemas/payment.py` — добавить CreatePaymentRequest, CreatePaymentResponse, PaymentStatusResponse
- [x] Создать `web/schemas/promo.py` — ApplyPromoRequest, PromoApplyResponse, ActiveDiscountResponse
- [x] Реализовать `core/services/payment_core.py` — httpx-клиенты для YooKassa, Platega, FreeKassa, SeverPay, CryptoPay; `create_web_payment()`; `get_available_providers()`
- [x] В `web/routers/payment.py` добавить:
  - [x] `POST /api/payments/create` — создание платежа (provider, months, promo_code?) → redirect_url
  - [x] `GET /api/payments/{id}/status` — статус для поллинга
- [x] Создать `web/routers/promo.py`:
  - [x] `POST /api/promo/apply` — применение промокода
  - [x] `DELETE /api/promo/active-discount` — отмена зарезервированной скидки
- [x] return_url при создании платежа = `{WEB_FRONTEND_URL}/payment/callback?payment_id={id}`
- [x] Добавить `GET /api/config` — список доступных провайдеров для фронтенда
- [x] **ПРОВЕРКА**: платёж создаётся, redirect_url валидный, статус поллится

### 4.2 Frontend — Payment UI
- [x] Обновить `src/api/payment.ts` — createPayment, getPaymentStatus, applyPromo, removeActiveDiscount
- [x] Создать `src/components/subscription/PlanSelector.tsx` — выбор тарифа с подсветкой выбранного, поддержка скидок
- [x] Создать `src/components/payment/PaymentMethodGrid.tsx` — сетка провайдеров (названия из bot locales)
- [x] Создать `src/components/payment/PromoInput.tsx` — поле ввода промокода с применением/удалением
- [x] Создать `src/pages/PaymentCallbackPage.tsx` — ожидание результата (поллинг каждые 2 сек, 2 мин таймаут)
- [x] Интегрировать PlanSelector, PromoInput, PaymentMethodGrid в SubscriptionPage
- [x] Добавить маршрут `/payment/callback` в App.tsx
- [x] **ПРОВЕРКА**: полный flow покупки работает (выбор → оплата → возврат → успех)

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 4
- [x] POST /payments/create → redirect на провайдера работает
- [x] Промокод применяется, скидка рассчитывается
- [x] PaymentCallbackPage показывает succeeded после оплаты
- [x] End-to-end: тестовая оплата → webhook в бот → статус на сайте

✅ **ФАЗА 4 ЗАВЕРШЕНА** (2026-03-28)

---

## ФАЗА 5: Фичи

### 5.1 Backend — Referral, Devices, Profile
- [ ] Создать `web/schemas/referral.py`, `web/schemas/device.py`
- [ ] Создать `web/routers/referral.py`:
  - [ ] `GET /api/referral` — код, ссылка, статистика
- [ ] Создать `web/routers/devices.py`:
  - [ ] `GET /api/devices` — список устройств (через panel API)
  - [ ] `DELETE /api/devices/{hwid}` — отключение устройства
- [ ] В `web/routers/profile.py` добавить:
  - [ ] `PATCH /api/profile/language` — смена языка
  - [ ] `POST /api/profile/email/send-code` — код для смены email
  - [ ] `POST /api/profile/email/verify` — подтверждение смены email
  - [ ] `POST /api/profile/link-telegram` — привязка Telegram через widget

### 5.2 Bot — Email linking
- [ ] Создать `bot/handlers/user/link_email.py` — FSM: ввод email → код → подтверждение
- [ ] Создать `bot/states/link_email_states.py` — FSM states
- [ ] Зарегистрировать хендлер в роутере
- [ ] **ПРОВЕРКА**: в боте /link_email → привязка email → вход на сайт по email

### 5.3 Frontend — Feature pages
- [ ] Создать `src/pages/ReferralPage.tsx` — реферальный код, ссылка, статистика
- [ ] Создать `src/components/referral/ReferralStats.tsx` и `ReferralLink.tsx`
- [ ] Создать `src/pages/DevicesPage.tsx` — список и отключение
- [ ] Создать `src/pages/ProfilePage.tsx` — email, язык, привязка Telegram
- [ ] **ПРОВЕРКА**: все страницы отображаются и функционируют

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 5
- [ ] Реферальная ссылка отображается и копируется
- [ ] Устройства видны, отключение работает
- [ ] Смена email с кодом подтверждения работает
- [ ] Привязка Telegram на сайте — аккаунты объединяются
- [ ] Бот: /link_email → email привязан → вход на сайт

---

## ФАЗА 6: Новостная лента

### 6.1 Bot — Channel post capture
- [ ] Создать `bot/handlers/channel_posts.py` — ловит channel_post, фильтрует по NEWS_CHANNEL_ID
- [ ] Сохраняет в `channel_posts` таблицу (текст, media_type, media_file_id, posted_at)
- [ ] Публикует `PUBLISH news:new_post {post_id}` в Redis
- [ ] Зарегистрировать хендлер в диспетчере
- [ ] **ПРОВЕРКА**: пост в канале → запись в БД + Redis PUBLISH

### 6.2 Backend — News API
- [ ] Создать `web/schemas/news.py`
- [ ] Создать `web/routers/news.py`:
  - [ ] `GET /api/news?page=1&limit=20` — пагинация из БД
  - [ ] `GET /api/news/stream` — SSE (Redis SUBSCRIBE → StreamingResponse)
  - [ ] `GET /api/news/media/{file_id}` — прокси Telegram media (кэш в Redis 1 час)
- [ ] **ПРОВЕРКА**: GET /api/news возвращает посты, SSE отправляет события

### 6.3 Frontend — News UI
- [ ] Создать `src/pages/NewsPage.tsx`
- [ ] Создать `src/components/news/NewsFeed.tsx` — контейнер ленты
- [ ] Создать `src/components/news/NewsPost.tsx` — отдельный пост (текст + медиа)
- [ ] Подключить EventSource для SSE — новые посты добавляются в начало
- [ ] **ПРОВЕРКА**: пост в канале → через 1-2 сек появляется на сайте

### КОНТРОЛЬНАЯ ПРОВЕРКА ФАЗЫ 6
- [ ] Пост в Telegram → запись в БД
- [ ] GET /api/news — посты с пагинацией
- [ ] SSE — real-time обновления
- [ ] Медиа отображается (фото, видео)
- [ ] Фронтенд: лента работает, новые посты появляются без перезагрузки

---

## ФАЗА 7: Полировка

### 7.1 i18n
- [ ] Настроить react-i18next
- [ ] Создать `src/i18n/ru.json` — все строки на русском
- [ ] Создать `src/i18n/en.json` — все строки на английском
- [ ] Для названий провайдеров оплаты — переиспользовать ключи из `locales/ru.json` и `locales/en.json` бота (`pay_with_yookassa_button`, `pay_with_platega_button`, `pay_with_sbp_button`, `pay_with_severpay_button`, `pay_with_cryptopay_button`)
- [ ] Переключатель языков на всех страницах
- [ ] **ПРОВЕРКА**: переключение ru/en обновляет все тексты

### 7.2 Responsive & Design
- [ ] Проверить все страницы на 375px (iPhone SE)
- [ ] Проверить на 414px (iPhone 12+)
- [ ] Проверить на 768px (iPad)
- [ ] Аудит BRAND_BOOK.md: цвета, шрифты, скругления, max-width 960px
- [ ] **ПРОВЕРКА**: всё отображается корректно на всех разрешениях

### 7.3 Security
- [ ] JWT: access в памяти (не localStorage), refresh в HttpOnly Secure cookie
- [ ] CORS: только WEB_FRONTEND_URL в allowed origins
- [ ] Input validation: все пользовательские данные проходят через Pydantic schemas
- [ ] XSS: sanitize user content в новостях
- [ ] Rate limiting: auth эндпоинты ограничены
- [ ] **ПРОВЕРКА**: нет уязвимостей при ручном тестировании

### 7.4 UX Polish
- [ ] Error boundaries на уровне страниц
- [ ] Toast уведомления (успех, ошибка)
- [ ] Loading states для всех асинхронных операций
- [ ] Empty states (нет подписки, нет платежей, нет новостей)
- [ ] **ПРОВЕРКА**: пользовательский опыт гладкий, ошибки обрабатываются

### 7.5 Production
- [ ] Docker compose production config (без dev ports, с volumes)
- [ ] Nginx reverse proxy конфигурация (SSL, домены)
- [ ] Environment variables для production
- [ ] **ПРОВЕРКА**: `docker compose -f docker-compose.prod.yml up -d` работает

### ФИНАЛЬНАЯ ПРОВЕРКА
- [ ] Регистрация → вход → dashboard → покупка → оплата → подписка активна
- [ ] Telegram Widget → вход → данные подтягиваются из бота
- [ ] Привязка email в боте → вход на сайт по email
- [ ] Привязка Telegram на сайте → данные объединяются
- [ ] Новости из канала → появляются на сайте в real-time
- [ ] Mobile view: всё адаптивно
- [ ] ru/en: все тексты переведены

---

*Документ обновляется по ходу реализации. Последнее обновление: 2026-03-26*
