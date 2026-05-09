# Remnawave TG Shop

**Форк** [kavore/remnawave-tg-shop](https://github.com/kavore/remnawave-tg-shop) с расширенными возможностями: веб-дашборд (личный кабинет) и полнофункциональная веб-панель администратора.

> Проверено на **Remnawave ≥ 2.7.0**.

---

## ✨ Ключевые возможности

### Telegram-бот (для пользователей)
- Регистрация и выбор языка (ru / en)
- Просмотр статуса подписки и ссылки на конфигурацию
- Раздел «Мои устройства» — просмотр и отключение подключённых устройств
- Пробный период
- Промокоды (скидка / бонусные дни / бесплатный период)
- Реферальная программа с бонусными днями
- Оплата через YooKassa, FreeKassa, CryptoPay, Platega, SeverPay, Telegram Stars
- Автопродление подписки (YooKassa)
- Уведомления об истечении подписки

### Telegram-бот (для администраторов)
- Статистика, управление пользователями (бан/разбан)
- Рассылка: всем / с активной подпиской / без подписки
- Управление промокодами (создание, просмотр, массовая генерация)
- Синхронизация с Remnawave Panel
- Просмотр логов действий с CSV-экспортом

### Веб-дашборд (`app.your-domain.com`)
- Аутентификация через Telegram Widget, Email + пароль
- Личный кабинет: подписка, история платежей, устройства, рефералы
- Привязка Telegram-аккаунта к веб-аккаунту
- Лента новостей из Telegram-канала (SSE real-time)
- Покупка и продление подписки через сайт
- i18n: русский / английский, динамическое переключение
- Динамическая тема (бренд, цвета, логотип из БД)

### Веб-панель администратора (`app.your-domain.com/admin`)
- Сводный дашборд: пользователи, доход (день/неделя/месяц), подписки
- Управление пользователями: поиск, бан, выдача дней/трафика, детальная карточка
- Таблица платежей с фильтрами и графиками дохода (recharts)
- Управление промокодами (CRUD)
- Мониторинг Remnawave: CPU/RAM, ноды, bandwidth, top-users
- Управление нодами (enable/disable/restart, restart-all)
- Рассылка через Redis Pub/Sub (прогресс в реальном времени)
- Настройка бренда: название, цвета, логотип
- Управление тарифными планами и платёжными провайдерами
- Включение/выключение разделов (новости, рефералы, устройства)
- Аудит-лог действий, Toast-уведомления, Confirm-диалоги

---

## 🚀 Технологический стек

| Слой | Технология |
|------|-----------|
| Telegram-бот | Python 3.12, Aiogram 3.x, webhook-режим |
| Web API | FastAPI + Uvicorn |
| Frontend | Vite + React 19 + React Router 7 |
| UI Kit | Shadcn/ui + Tailwind CSS 4 |
| State Management | TanStack Query v5 |
| i18n | react-i18next |
| Auth | PyJWT + bcrypt, Telegram HMAC-SHA256 |
| Email | Resend Python SDK |
| Cache / Sessions | Redis 7 |
| ORM | SQLAlchemy 2.x async + asyncpg |
| Validation | Pydantic v2 |
| HTTP Client | httpx |
| Database | PostgreSQL 17 |
| Container | Docker + Docker Compose |

---

## 🏗️ Архитектура

```
Reverse Proxy (Nginx / Caddy / Traefik)
├── your-domain.com/webhook/*  → Bot (Aiogram)        :8080
├── your-domain.com/api/*      → Web API (FastAPI)    :8090
└── your-domain.com/*          → Frontend (React SPA) :3000
                                         │
                                  PostgreSQL 17
                                         │
                                    Redis 7
```

### Request Flow

```
Telegram → /webhook/telegram → bot/handlers/
Payment Provider → /webhook/{provider} → bot/handlers/user/payment.py
Remnawave Panel → /webhook/panel → bot/services/panel_webhook_service.py

Browser → /api/* → web/routers/ → core/services/ → core/dal/ → PostgreSQL
```

---

## ⚙️ Установка и запуск

### Предварительные требования

- Docker и Docker Compose
- Работающая панель Remnawave ≥ 2.7.0
- Токен Telegram-бота
- Данные для подключения к платёжным системам

### Шаги установки

**1. Клонируйте репозиторий:**

```bash
git clone https://github.com/VAQYBIN/remnawave-tg-shop
cd remnawave-tg-shop
```

**2. Создайте файл `.env`:**

```bash
cp .env.example .env
nano .env
```

Обязательные поля для заполнения:

| Переменная | Описание |
|-----------|---------|
| `BOT_TOKEN` | Токен вашего Telegram-бота |
| `ADMIN_IDS` | Telegram ID администраторов (через запятую) |
| `WEBHOOK_BASE_URL` | Базовый URL для всех вебхуков |
| `PANEL_API_URL` | URL API Remnawave (например, `http://remnawave:3000/api`) |
| `PANEL_API_KEY` | API-ключ из UI панели Remnawave |
| `PANEL_WEBHOOK_SECRET` | Секрет для проверки вебхуков от панели |
| `USER_SQUAD_UUIDS` | UUID отрядов для новых пользователей |
| `WEB_JWT_SECRET` | Секрет для подписи JWT (придумайте длинную строку) |
| `REDIS_URL` | `redis://remnawave-tg-shop-redis:6379/0` |
| `WEB_FRONTEND_URL` | URL фронтенда, например `https://app.your-domain.com` |
| `WEB_API_URL` | URL Web API, например `https://your-domain.com` |
| `WEB_CORS_ORIGINS` | Разрешённые origins для CORS |
| `BOT_USERNAME` | Username бота без `@` |

**3. Запустите сервисы:**

```bash
# Production (готовые образы с GHCR)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Разработка (локальная сборка)
docker compose up -d
```

**4. Настройте обратный прокси (Nginx):**

В репозитории есть готовый `nginx/nginx.conf`, который обслуживает все три сервиса на одном домене.

```nginx
upstream remnawave-tg-shop         { server remnawave-tg-shop:8080; }
upstream remnawave-tg-shop-web-api { server remnawave-tg-shop-web-api:8090; }
upstream remnawave-tg-shop-web-frontend { server remnawave-tg-shop-web-frontend:3000; }

server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSE (лента новостей) — без буферизации
    location = /api/news/stream {
        proxy_pass http://remnawave-tg-shop-web-api;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location /api/ { proxy_pass http://remnawave-tg-shop-web-api; }
    location /webhook/ { proxy_pass http://remnawave-tg-shop; }
    location / { proxy_pass http://remnawave-tg-shop-web-frontend; }
}
```

**5. Просмотр логов:**

```bash
docker compose logs -f remnawave-tg-shop
docker compose logs -f remnawave-tg-shop-web-api
```

### Миграции БД

Миграции применяются автоматически при каждом запуске. Для ручного запуска:

```bash
alembic upgrade head
```

---

## 📋 Переменные окружения

<details>
<summary><b>Основные настройки бота</b></summary>

| Переменная | Описание | Пример |
|-----------|---------|--------|
| `BOT_TOKEN` | Токен Telegram-бота | `1234567890:ABC-DEF...` |
| `ADMIN_IDS` | ID администраторов (через запятую) | `12345678,98765432` |
| `DEFAULT_LANGUAGE` | Язык по умолчанию | `ru` |
| `SUPPORT_LINK` | Ссылка на поддержку | `https://t.me/your_support` |
| `SUBSCRIPTION_MINI_APP_URL` | URL Mini App | `https://t.me/your_bot/app` |
| `MY_DEVICES_SECTION_ENABLED` | Раздел «Мои устройства» | `false` |
| `REQUIRED_CHANNEL_SUBSCRIBE_TO_USE` | Обязательная подписка на канал | `false` |
| `REFERRAL_ENABLED` | Реферальная система | `true` |
| `TRIAL_ENABLED` | Пробный период | `true` |
| `TRIAL_DURATION_DAYS` | Длительность пробного периода (дней) | `5` |

</details>

<details>
<summary><b>Webhook и сеть</b></summary>

| Переменная | Описание |
|-----------|---------|
| `WEBHOOK_BASE_URL` | Базовый URL для вебхуков (`https://your-domain.com`) |
| `TELEGRAM_WEBHOOK_PATH` | Путь Telegram-вебхука (по умолчанию `/webhook/telegram`) |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет заголовка `X-Telegram-Bot-Api-Secret-Token` |
| `WEB_SERVER_HOST` | Хост веб-сервера бота (по умолчанию `0.0.0.0`) |
| `WEB_SERVER_PORT` | Порт веб-сервера бота (по умолчанию `8080`) |

</details>

<details>
<summary><b>Платёжные системы</b></summary>

| Переменная | Описание |
|-----------|---------|
| `PAYMENT_METHODS_ORDER` | Порядок кнопок оплаты (через запятую): `severpay,yookassa,cryptopay,freekassa,platega,stars` |
| `YOOKASSA_ENABLED` | Включить YooKassa |
| `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` | Данные магазина YooKassa |
| `YOOKASSA_AUTOPAYMENTS_ENABLED` | Автопродление через YooKassa |
| `YOOKASSA_TAX_SYSTEM_CODE` | Код СНО для чеков (1–6) |
| `FREEKASSA_ENABLED` | Включить FreeKassa |
| `FREEKASSA_MERCHANT_ID` / `FREEKASSA_API_KEY` / `FREEKASSA_SECOND_SECRET` | Данные магазина FreeKassa |
| `CRYPTOPAY_ENABLED` | Включить CryptoPay |
| `CRYPTOPAY_TOKEN` | API-токен CryptoPay |
| `PLATEGA_ENABLED` | Включить Platega |
| `PLATEGA_MERCHANT_ID` / `PLATEGA_SECRET` | Данные магазина Platega |
| `SEVERPAY_ENABLED` | Включить SeverPay |
| `SEVERPAY_MID` / `SEVERPAY_TOKEN` | Данные магазина SeverPay |
| `STARS_ENABLED` | Включить Telegram Stars |
| `NALOGO_INN` / `NALOGO_PASSWORD` | Самозанятый: интеграция с nalog.ru |

</details>

<details>
<summary><b>Тарифные планы</b></summary>

```env
1_MONTH_ENABLED=true
RUB_PRICE_1_MONTH=150
STARS_PRICE_1_MONTH=0

3_MONTHS_ENABLED=true
RUB_PRICE_3_MONTHS=300

6_MONTHS_ENABLED=true
RUB_PRICE_6_MONTHS=500

12_MONTHS_ENABLED=true
RUB_PRICE_12_MONTHS=900

# Пакеты трафика (опционально)
TRAFFIC_PACKAGES=10:199,50:799
```

> Цены и планы можно управлять через веб-панель администратора — настройки из БД имеют приоритет над `.env`.

</details>

<details>
<summary><b>Remnawave Panel</b></summary>

| Переменная | Описание |
|-----------|---------|
| `PANEL_API_URL` | URL API панели (`http://remnawave:3000/api`) |
| `PANEL_API_KEY` | API-ключ из UI панели |
| `PANEL_WEBHOOK_SECRET` | Секрет для проверки вебхуков |
| `USER_SQUAD_UUIDS` | UUID отрядов для новых пользователей |
| `USER_EXTERNAL_SQUAD_UUID` | UUID External Squad (опционально) |
| `USER_TRAFFIC_LIMIT_GB` | Лимит трафика (0 = безлимит) |
| `USER_HWID_DEVICE_LIMIT` | Лимит устройств HWID (0 = безлимит) |

</details>

<details>
<summary><b>Веб-дашборд</b></summary>

| Переменная | Описание |
|-----------|---------|
| `WEB_JWT_SECRET` | Секрет для JWT (обязательно, длинная случайная строка) |
| `WEB_JWT_ACCESS_EXPIRE_MINUTES` | Время жизни access-токена (по умолчанию `15`) |
| `WEB_JWT_REFRESH_EXPIRE_DAYS` | Время жизни refresh-токена (по умолчанию `7`) |
| `REDIS_URL` | URL Redis (`redis://remnawave-tg-shop-redis:6379/0`) |
| `RESEND_API_KEY` | API-ключ Resend для отправки email |
| `RESEND_FROM_EMAIL` | Email отправителя |
| `WEB_FRONTEND_URL` | URL фронтенда (`https://app.your-domain.com`) |
| `WEB_API_URL` | URL Web API (`https://your-domain.com`) |
| `WEB_CORS_ORIGINS` | Разрешённые CORS origins |
| `NEWS_CHANNEL_ID` | ID Telegram-канала для ленты новостей |
| `BOT_USERNAME` | Username бота без `@` |
| `WEB_DOCS_ENABLED` | Включить Swagger/ReDoc (только для разработки) |

</details>

<details>
<summary><b>Логирование и уведомления</b></summary>

| Переменная | Описание |
|-----------|---------|
| `LOG_CHAT_ID` | ID чата для уведомлений администратора |
| `LOG_THREAD_ID` | ID топика в супергруппе |
| `LOG_NEW_USERS` | Логировать новых пользователей |
| `LOG_PAYMENTS` | Логировать платежи |
| `LOG_PROMO_ACTIVATIONS` | Логировать активации промокодов |
| `LOG_TRIAL_ACTIVATIONS` | Логировать пробные периоды |
| `LOG_STORE_MESSAGE_CONTENT` | Сохранять тексты сообщений в БД |
| `LOG_ADMIN_HIDE` | Скрывать действия админов в UI логов |
| `LOGS_PAGE_SIZE` | Записей на странице логов |

</details>

---

## 📁 Структура проекта

```
remnawave-tg-shop/
├── bot/                        # Telegram-бот (Aiogram)
│   ├── handlers/               # Хендлеры сообщений и callback
│   │   ├── user/               # Пользовательские хендлеры
│   │   ├── admin/              # Административные хендлеры
│   │   └── channel_posts.py    # Захват постов канала → Redis
│   ├── services/               # Платёжные сервисы и интеграции
│   ├── middlewares/            # i18n, db_session, ban_check, profile_sync
│   └── main_bot.py
│
├── core/                       # Общая бизнес-логика (бот + веб)
│   ├── dal/                    # Data Access Layer
│   └── services/               # Core Services (panel_client, payment_core, ...)
│
├── web/                        # FastAPI Web API
│   ├── auth/                   # JWT, Telegram HMAC, bcrypt, email
│   ├── routers/                # Эндпоинты
│   │   ├── admin/              # /api/admin/* (13 роутеров)
│   │   └── ...                 # subscription, payment, profile, news, ...
│   └── schemas/                # Pydantic v2 схемы
│
├── frontend/                   # React SPA (Vite)
│   └── src/
│       ├── pages/              # Страницы дашборда и админки
│       ├── components/         # UI-компоненты
│       ├── api/                # HTTP-клиент с JWT auto-refresh
│       └── i18n/               # ru.json, en.json
│
├── db/
│   ├── models.py               # SQLAlchemy ORM-модели
│   └── dal/                    # Re-export из core/dal/ (обратная совместимость)
│
├── config/settings.py          # Pydantic Settings (единый источник конфига)
├── nginx/nginx.conf            # Готовый конфиг Nginx для single-domain деплоя
├── docker-compose.yml          # Локальная разработка (с локальной сборкой)
├── docker-compose.prod.yml     # Production (готовые образы с GHCR)
└── .env.example
```

---

## 🐳 Docker-образы

Production-образы публикуются в GitHub Container Registry автоматически при пуше в `main`:

| Образ | Описание |
|-------|---------|
| `ghcr.io/vaqybin/remnawave-tg-shop:latest` | Telegram-бот |
| `ghcr.io/vaqybin/remnawave-tg-shop-web-api:latest` | FastAPI Web API |
| `ghcr.io/vaqybin/remnawave-tg-shop-web-frontend:latest` | React SPA (nginx) |

---

## 🔗 API-эндпоинты (краткий справочник)

<details>
<summary><b>Auth /api/auth/</b></summary>

| Метод | Путь | Описание |
|-------|------|---------|
| POST | `/auth/telegram` | Вход через Telegram Widget |
| POST | `/auth/register/send-code` | Регистрация: отправить код на email |
| POST | `/auth/register/verify` | Регистрация: подтвердить код |
| POST | `/auth/login` | Вход по email + пароль |
| POST | `/auth/password/send-reset-code` | Сброс пароля: отправить код |
| POST | `/auth/password/reset` | Сброс пароля: подтвердить |
| POST | `/auth/refresh` | Обновить access-токен |
| POST | `/auth/logout` | Выход |

</details>

<details>
<summary><b>Пользовательские эндпоинты</b></summary>

| Метод | Путь | Описание |
|-------|------|---------|
| GET/PATCH | `/api/profile` | Профиль |
| GET | `/api/subscription` | Активная подписка |
| GET | `/api/subscription/plans` | Доступные тарифы |
| GET | `/api/subscription/connection` | Ссылка на конфиг |
| PATCH | `/api/subscription/auto-renew` | Автопродление |
| GET | `/api/payments` | История платежей |
| POST | `/api/payments/create` | Создать платёж |
| GET | `/api/payments/{id}/status` | Статус платежа |
| POST | `/api/promo/apply` | Применить промокод |
| GET | `/api/referral` | Реферальная статистика |
| GET/DELETE | `/api/devices` | Список устройств / отключить |
| GET | `/api/news` | Лента новостей |
| GET | `/api/news/stream` | SSE real-time поток |

</details>

<details>
<summary><b>Admin /api/admin/</b></summary>

| Метод | Путь | Описание |
|-------|------|---------|
| GET | `/admin/me` | Проверка прав |
| GET | `/admin/dashboard` | Сводная статистика |
| GET/PATCH | `/admin/branding` | Настройки бренда |
| POST | `/admin/branding/logo` | Загрузка логотипа |
| GET/PATCH | `/admin/features` | Вкл/выкл разделов |
| GET/POST/PATCH/DELETE | `/admin/plans` | Тарифные планы |
| GET/PATCH | `/admin/payment-providers` | Платёжные провайдеры |
| GET | `/admin/users` | Список пользователей |
| GET | `/admin/users/{id}` | Детали пользователя |
| POST | `/admin/users/{id}/ban` | Забанить |
| POST | `/admin/users/{id}/unban` | Разбанить |
| POST | `/admin/users/{id}/add-days` | Добавить дни |
| POST | `/admin/users/{id}/add-traffic` | Добавить трафик |
| GET | `/admin/payments` | Список платежей |
| GET | `/admin/payments/stats` | Статистика дохода |
| GET/POST/PATCH/DELETE | `/admin/promos` | Промокоды |
| POST | `/admin/broadcast` | Рассылка |
| GET | `/admin/broadcast/status/{id}` | Статус рассылки |
| GET | `/admin/panel/stats` | CPU/RAM/users Remnawave |
| GET | `/admin/panel/nodes` | Список нод |
| POST | `/admin/panel/nodes/{uuid}/enable\|disable\|restart` | Управление нодой |
| POST | `/admin/panel/nodes/restart-all` | Рестарт всех нод |
| GET | `/admin/panel/users` | Пользователи панели |

</details>

---

## 🔧 Разработка

```bash
# Установка зависимостей бота
pip install -r requirements.txt

# Установка зависимостей Web API
pip install -r web/requirements.txt

# Фронтенд
cd frontend
npm install
npm run dev      # разработка → localhost:5173
npm run build    # production build

# Миграции
alembic upgrade head
alembic revision --autogenerate -m "описание"

# Запуск бота без Docker
python main.py
```

---

## 📜 Вебхуки платёжных систем

| Путь | Провайдер |
|------|---------|
| `/webhook/telegram` | Telegram |
| `/webhook/yookassa` | YooKassa |
| `/webhook/freekassa` | FreeKassa |
| `/webhook/cryptopay` | CryptoPay |
| `/webhook/platega` | Platega |
| `/webhook/severpay` | SeverPay |
| `/webhook/panel` | Remnawave Panel |

---

## ❤️ Благодарности

Проект основан на [kavore/remnawave-tg-shop](https://github.com/kavore/remnawave-tg-shop).
