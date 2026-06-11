# Remnawave TG Shop

**Форк** [kavore/remnawave-tg-shop](https://github.com/kavore/remnawave-tg-shop) с расширенными возможностями: веб-дашборд (личный кабинет) и полнофункциональная веб-панель администратора.

> Проверено на **Remnawave 2.7.4**.

---

## ✨ Ключевые возможности

### Telegram-бот (для пользователей)
- Регистрация и выбор языка (ru / en)
- Просмотр статуса подписки и ссылки на конфигурацию
- Раздел «Мои устройства» — просмотр и отключение подключённых устройств
- **Custom Tariffs**: выбор тарифа → описание → вариант (срок/трафик) → оплата
- **Addon-тарифы**: докупка трафика/локаций к активной подписке с пропорциональной ценой
- Пробный период
- Промокоды (скидка / бонусные дни / бесплатный период)
- Реферальная программа с бонусными днями
- Оплата через YooKassa, FreeKassa, CryptoPay, Platega, SeverPay, Telegram Stars
- Автопродление подписки (bundle: standalone + addon с включённым автопродлением)
- Уведомления об истечении подписки

### Telegram-бот (для администраторов)
- Статистика, управление пользователями (бан/разбан)
- Рассылка: всем / с активной подпиской / без подписки
- Управление промокодами (создание, просмотр, массовая генерация)
- **Управление тарифами** (🗂 Тарифы): создание standalone/addon/trial-тарифов через FSM, выбор Remnawave squad из API, enable/disable, удаление/архивирование
- Синхронизация с Remnawave Panel
- Просмотр логов действий с CSV-экспортом

### Веб-дашборд (`app.your-domain.com`)
- Аутентификация через Telegram Widget, Email + пароль
- Личный кабинет: подписка, история платежей, устройства, рефералы, поддержка
- **Раздел «Устройства» с двумя вкладками:**
  - *Устройства* — подключённые устройства (HWID, онлайн-статус, отключение) + список приложений для скачивания по выбранной ОС
  - *Инструкция* — пошаговый гайд по подключению: выбор ОС → приложение → шаги с кнопками скачивания и deep-link «Добавить подписку». Данные берутся из **Subscription Page** панели Remnawave (см. [раздел ниже](#-страница-подключения-subscription-page))
- **Поддержка:** тикеты с перепиской и вложениями, real-time уведомления (SSE)
- Привязка Telegram-аккаунта к веб-аккаунту, Telegram-идентичность в сайдбаре
- Лента новостей из Telegram-канала (SSE real-time)
- Покупка и продление подписки через сайт (Custom Tariffs: тариф → вариант → оплата)
- Addon-тарифы с пропорциональной ценой и автопродление по отдельным entitlements
- Юридические документы (оферта, политики) на странице профиля
- i18n: русский / английский, динамическое переключение
- Динамическая тема (бренд, цвета, логотип, favicon из БД)

### Веб-панель администратора (`app.your-domain.com/admin`)
- Сводный дашборд: пользователи, доход (день/неделя/месяц), подписки
- Управление пользователями: поиск, бан, выдача дней/трафика, детальная карточка
- Таблица платежей с фильтрами и графиками дохода (recharts)
- Управление промокодами (CRUD)
- Мониторинг Remnawave: CPU/RAM, ноды, bandwidth, top-users
- Управление нодами (enable/disable/restart, restart-all)
- Рассылка через Redis Pub/Sub (прогресс в реальном времени)
- Настройка бренда: название, цвета, логотип, favicon (с возможностью удаления)
- **Управление тарифами (Custom Tariffs)**: standalone/addon/trial, Remnawave squad picker, billing model (time/traffic/hybrid), варианты по сроку/трафику, цены RUB/Stars, архивирование, drag-and-drop сортировка
- Управление платёжными провайдерами
- **Поддержка:** просмотр тикетов, ответы пользователям, смена статуса, real-time уведомления
- Карточка пользователя: устройства и таймлайн активности
- Просмотр пользователей панели Remnawave с детальной карточкой
- Включение/выключение разделов (новости, рефералы, устройства, поддержка)
- Аудит-лог действий (включая действия в веб-кабинете), Toast-уведомления, Confirm-диалоги

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
- Работающая панель Remnawave **2.7.4** (требуется для Custom Tariffs — используется Internal Squads API: `GET /internal-squads`, `GET /internal-squads/{uuid}`)
- Токен Telegram-бота
- Данные для подключения к платёжным системам

### Шаги установки

**1. Создайте директорию проекта и скачайте production-файлы:**

```bash
mkdir -p remnawave-tg-shop && cd remnawave-tg-shop

curl -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/VAQYBIN/remnawave-tg-shop/main/docker-compose.prod.yml

curl -fsSLo .env \
  https://raw.githubusercontent.com/VAQYBIN/remnawave-tg-shop/main/.env.example

curl -fsSL https://github.com/VAQYBIN/remnawave-tg-shop/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=1 remnawave-tg-shop-main/locales
```

**2. Заполните файл `.env`:**

```bash
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
docker compose up -d && docker compose logs -f
```

**4. Настройте обратный прокси (Nginx):**

Проект можно проксировать двумя способами:

- **один домен**: `/api/*`, `/webhook/*` и frontend обслуживаются на одном домене;
- **три поддомена**: отдельные домены для frontend, API и webhook'ов.

### Вариант 1: один домен

Подходит, если хотите обслуживать весь проект на одном домене, например `https://your-domain.com`.

Рекомендуемые значения `.env`:

```env
WEB_FRONTEND_URL=https://your-domain.com
WEB_API_URL=https://your-domain.com
WEBHOOK_BASE_URL=https://your-domain.com
WEB_CORS_ORIGINS=https://your-domain.com
```

```nginx
upstream remnawave-tg-shop {
    server remnawave-tg-shop:8080;
}

upstream remnawave-tg-shop-web-api {
    server remnawave-tg-shop-web-api:8090;
}

upstream remnawave-tg-shop-web-frontend {
    server remnawave-tg-shop-web-frontend:3000;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.key;

    # SSE (лента новостей) — без буферизации
    location = /api/news/stream {
        proxy_pass http://remnawave-tg-shop-web-api;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location /api/ {
        proxy_pass http://remnawave-tg-shop-web-api;
    }

    location /webhook/ {
        proxy_pass http://remnawave-tg-shop;
    }
    
    location / {
        proxy_pass http://remnawave-tg-shop-web-frontend;
    }
}
```

### Вариант 2: три поддомена

Подходит, если на production уже есть отдельный nginx-контейнер в общей Docker-сети и вы хотите разделить публичные точки входа:

- `https://app.your-domain.com` — frontend;
- `https://api.your-domain.com` — Web API;
- `https://webhook.your-domain.com` — Telegram, платежные и panel webhooks.

Рекомендуемые значения `.env`:

```env
WEB_FRONTEND_URL=https://app.your-domain.com
WEB_API_URL=https://api.your-domain.com
WEBHOOK_BASE_URL=https://webhook.your-domain.com
WEB_CORS_ORIGINS=https://app.your-domain.com
```

Nginx должен быть подключен к той же Docker-сети, что и контейнеры проекта, например к `remnawave-network`.

```nginx
upstream remnawave-tg-shop {
    server remnawave-tg-shop:8080;
}

upstream remnawave-tg-shop-web-api {
    server remnawave-tg-shop-web-api:8090;
}

upstream remnawave-tg-shop-web-frontend {
    server remnawave-tg-shop-web-frontend:3000;
}

server {
    listen 443 ssl;
    http2 on;
    server_name webhook.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.key;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    location / {
        proxy_pass http://remnawave-tg-shop;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.key;

    location / {
        proxy_http_version 1.1;
        proxy_pass http://remnawave-tg-shop-web-api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name app.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.key;

    location / {
        proxy_http_version 1.1;
        proxy_pass http://remnawave-tg-shop-web-frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**5. Просмотр логов:**

```bash
docker compose logs -f remnawave-tg-shop
docker compose logs -f remnawave-tg-shop-web-api
```

### Обновление

Если проект установлен через скачивание `docker-compose.yml` и папки `locales`, обновление выполняется без клонирования репозитория.

**1. Обновите `locales`:**

Перед обновлением сохраните текущую папку `locales`. Это полезно, если вы вручную меняли тексты.

```bash
cp -a locales "locales.backup.$(date +%Y%m%d-%H%M%S)"
rm -rf locales

curl -fsSL https://github.com/VAQYBIN/remnawave-tg-shop/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=1 remnawave-tg-shop-main/locales
```

Если вы редактировали локализации вручную, после обновления сравните `locales` с созданным backup и перенесите свои изменения.

**2. Скачайте новые образы и перезапустите сервисы:**

```bash
docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

**3. Проверьте состояние контейнеров и логи:**

```bash
docker compose ps
docker compose logs -f --tail=100
```

### Миграции БД

Миграции применяются автоматически при каждом запуске. Для ручного запуска:

```bash
docker compose exec remnawave-tg-shop alembic upgrade head
```

---

## 🔑 Настройка внешних сервисов

### Telegram Login (OIDC)

Авторизация через Telegram на сайте работает через OpenID Connect. Без настройки кнопка «Войти через Telegram» не будет работать.

**1. Откройте @BotFather и перейдите в управление ботами:**

В Telegram откройте `@BotFather` → нажмите кнопку **Mini App** в нижней части экрана.

**2. Выберите вашего бота:**

В списке нажмите на нужного бота.

**3. Перейдите в настройки Login Widget:**

Нажмите **Bot Settings** → **Login Widget** → **Switch to OpenID Connect Login**.

Подтвердите переключение. После этого откроются настройки OIDC.

**4. Скопируйте данные:**

- **Client ID** — числовой идентификатор бота. Он совпадает с первой частью `BOT_TOKEN` (до символа `:`). Указывать отдельно в `.env` не нужно — вычисляется автоматически.
- **Client Secret** → скопируйте и вставьте в `.env`:

```env
TELEGRAM_OIDC_CLIENT_SECRET=<скопированный_секрет>
```

**5. Настройте Redirect URI:**

В поле **Redirect URIs** добавьте:

```
https://app.your-domain.com/auth/telegram/callback
```

**6. Настройте Trusted Origins:**

В поле **Trusted Origins** добавьте:

```
https://app.your-domain.com
```

Нажмите **Save**. Авторизация через Telegram теперь работает.

---

### Resend — отправка email

Resend используется для отправки кодов подтверждения при регистрации, смене и восстановлении пароля. Без настройки email-регистрация недоступна (Telegram-авторизация продолжает работать).

**1. Зарегистрируйтесь на [resend.com](https://resend.com)**

**2. Добавьте домен:**

Перейдите в раздел **Domains** → **Add Domain**. Введите домен, с которого будут приходить письма (например, `your-domain.com`).

**3. Добавьте DNS-записи:**

Resend покажет список записей — обычно это:
- **SPF** — TXT-запись (`v=spf1 include:amazonses.com ~all`)
- **DKIM** — 2–3 CNAME-записи для подписи писем
- **DMARC** — TXT-запись (опционально)

Добавьте их в DNS-настройках вашего домена.

> **Важно для Cloudflare:** DNS-записи DKIM (CNAME) должны быть в режиме **DNS only** (серое облако), а не **Proxied** (оранжевое). Иначе верификация домена не пройдёт. Подробнее: [resend.com/docs/knowledge-base/cloudflare](https://resend.com/docs/knowledge-base/cloudflare).

**4. Дождитесь верификации:**

После добавления записей нажмите **Verify**. Обычно занимает от 1 до 15 минут.

**5. Создайте API-ключ:**

Перейдите в **API Keys** → **Create API Key**. Дайте ему имя (например, `remnawave-tg-shop`) и выберите разрешение **Sending access**.

Скопируйте ключ — он показывается только один раз.

**6. Заполните `.env`:**

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx   # API-ключ из шага 5
RESEND_FROM_EMAIL=noreply@your-domain.com        # Email отправителя (должен соответствовать верифицированному домену)
```

> Email в `RESEND_FROM_EMAIL` должен принадлежать домену, добавленному в шаге 2. Например, если домен `petrovich.com` — можно использовать `noreply@petrovich.com`.

---

## 🧩 Custom Tariffs (кастомные тарифы)

Начиная с этой версии тарифы хранятся в БД и управляются через админку (web или
bot), а не через `.env`. Поддерживаются несколько тарифов, разные Remnawave
Internal Squads, тарифы по сроку, по трафику, смешанные, пробный период как
тариф и добавочные (addon) тарифы.

> Требуется **Remnawave 2.7.4** — тарифы валидируют и выбирают Internal Squads
> через API панели. Если панель недоступна, создание/включение тарифа со squad
> блокируется.

### Основные понятия

| Понятие | Описание |
|---------|----------|
| **standalone** | Самостоятельный тариф. У пользователя может быть только один активный. Покупка другого standalone заменяет старый, оплаченное время не теряется. |
| **addon** | Добавочный тариф. Покупается только при активном standalone, действует до конца его срока, цена пересчитывается пропорционально остатку. |
| **trial** | Пробный период как тариф (`is_trial=true`, цена 0). Один trial на пользователя (контроль через `trial_activations`). |
| **billing model** | `time` (по сроку), `traffic` (по объёму ГБ), `hybrid` (срок + ГБ). |
| **option (вариант)** | Конкретная покупка тарифа: срок (месяцы/дни) и/или трафик (ГБ или unlimited) + цены RUB/Stars. |
| **squad** | Remnawave Internal Squad, привязанный к тарифу. Итоговые `activeInternalSquads` = squad активного standalone + squad'ы активных addon. |

Правила трафика: купленные ГБ суммируются с текущим лимитом. Explicit unlimited
(`traffic_unlimited=true`) не превращается в ограниченный лимит при покупке addon.

### Миграция существующих установок (open-source)

Обновление безопасно для старых подписок — ничего не теряется:

1. **Миграции БД применяются автоматически** при старте. Migration
   `0010_custom_tariffs_phase1` переименовывает старую таблицу `pricing_plans` в
   `pricing_plans_legacy` (она **не удаляется** — для отката/сверки) и создаёт
   новую схему: `pricing_plans`, `pricing_plan_options`,
   `user_plan_entitlements`, `entitlement_payments`.
2. **Старые тарифы переносятся** в новый тариф `legacy-default` (standalone) с
   вариантами из старых строк. Если старых строк нет — bootstrap создаёт
   `legacy-default` из `.env` (цены `RUB_PRICE_*` / `STARS_PRICE_*` + первый
   `USER_SQUAD_UUIDS`).
3. **Если в `.env` нет цен или squad** — bootstrap создаёт тариф выключенным и
   пишет warning в логи. Включите/исправьте тариф в админке вручную.
4. **Старые подписки (`subscriptions`) продолжают работать** как раньше —
   `plan_id` для них необязателен.
5. **Новые покупки идут через БД-тарифы.** Поля `.env` с ценами и
   `USER_SQUAD_UUIDS` помечены **deprecated** — менять их после bootstrap
   бесполезно, правьте тарифы в админке.

> ⚠️ Не добавляйте NOT NULL колонки в старую `pricing_plans` вручную — схема
> уже мигрирована. Для доступа к старым данным используйте `pricing_plans_legacy`.

### Настройка тарифов в web admin

1. Откройте `app.your-domain.com/admin` → раздел **Тарифы (Plans)**.
2. Нажмите **Создать тариф** и заполните форму:
   - Название и описание RU/EN;
   - **Тип**: standalone / addon (addon нельзя сделать trial);
   - **Billing model**: time / traffic / hybrid;
   - **Remnawave squad** — выберите из списка (подгружается из панели, кэш 5 мин);
   - **Traffic reset strategy** (только для traffic/hybrid; для time всегда `NO_RESET`);
   - **Trial** (`is_trial`) — форсирует standalone и цену 0;
   - **Min price RUB/Stars** — нижняя граница пропорциональной цены addon.
3. Добавьте **варианты (options)**: срок (месяцы **или** дни — не оба сразу),
   трафик (ГБ или unlimited — для time-тарифа выбор обязателен), цены RUB/Stars.
4. Сохраните, затем включите тариф (toggle). Порядок тарифов меняется
   drag-and-drop.
5. **Архивирование** вместо удаления: если тариф уже кто-то покупал, его нельзя
   удалить (409) — только архивировать. Архивный тариф скрыт из каталога для
   новых, но активные подписчики продолжают им пользоваться и продлевать.
   «Восстановить из архива» не включает тариф — публикуйте отдельным действием.

### Настройка тарифов в bot admin

1. В боте откройте `/admin` → кнопка **🗂 Тарифы**.
2. **Создать тариф** запускает пошаговый FSM-флоу: название RU/EN → описание →
   выбор Remnawave squad (inline-кнопки из API, кэшируется на сессию) → тип →
   billing model → reset strategy → trial → добавление вариантов (срок + трафик +
   цены) → подтверждение → сохранение. Тариф создаётся **выключенным**.
3. В карточке тарифа доступны **Включить / Выключить / Удалить** (удаление
   блокируется при активных подписках; архивный тариф показывает «Восстановить
   из архива»).
4. Если Remnawave недоступен на шаге выбора squad — создание отменяется с
   понятным сообщением.

Тарифы, созданные в боте, видны в web admin и наоборот — источник один (БД).

---

## 📱 Страница подключения (Subscription Page)

Вкладки **«Устройства»** и **«Инструкция»** в веб-кабинете показывают список
приложений и пошаговый гайд по подключению — те же данные, что и официальная
[Remnawave Subscription Page](https://github.com/remnawave/subscription-page).
Кабинет **подтягивает конфиг прямо из панели** (по `PANEL_API_URL` /
`PANEL_API_KEY`), поэтому отдельный файл или токен не нужны.

### ⚠️ Обязательная настройка

Чтобы вкладка «Инструкция» показывала реальные приложения и шаги, в панели
Remnawave должна быть создана хотя бы одна **Subscription Page** (раздел
*Subscription Page Builder* в UI панели). Кабинет читает её через
`GET /api/subscription-page-configs`.

- Если в панели **нет** ни одной Subscription Page — вкладка «Инструкция»
  покажет заглушку «не настроено», а на вкладке «Устройства» останется
  встроенный fallback-список из 4 клиентов. Это не ошибка — просто настройте
  Subscription Page в панели.
- Никаких дополнительных ключей задавать **не требуется** — используются уже
  настроенные `PANEL_API_URL` и `PANEL_API_KEY`.

### Как это работает

- Конфиг тянется **вживую** и кэшируется на ~5 минут. Отредактировали
  Subscription Page в панели → изменения появятся в кабинете в течение
  нескольких минут (или сразу после рестарта `web-api`). **Авто-синхронизация
  без ручного копирования файлов.**
- Если в панели несколько Subscription Page, по умолчанию берётся конфиг
  **«Default»** (UUID `00000000-0000-0000-0000-000000000000`), иначе первый по
  порядку. Закрепить конкретный конфиг можно через `SUBSCRIPTION_PAGE_CONFIG_UUID`.
- Бренд-иконки приложений рендерятся на тёмной подложке (видны на любой теме),
  HTML шагов и схемы ссылок санитизируются (DOMPurify; deep-link схемы вроде
  `happ://`, `v2raytun://` разрешены, `javascript:`/`data:` блокируются).

### Офлайн-override (опционально)

Если панель не отдаёт конфиг (старая версия) или нужен кастомный список —
можно смонтировать файл `app-config-v2.json` в контейнер и указать путь:

```yaml
# docker-compose.yml → сервис remnawave-tg-shop-web-api → volumes:
- ./app-config-v2.json:/app/app-config-v2.json:ro
```
```env
SUBSCRIPTION_PAGE_CONFIG_PATH=/app/app-config-v2.json
```

Файл в формате v2 можно взять со своей развёрнутой Subscription Page
(`<sub-page>/assets/.app-config-v2.json`). Если путь задан и файл существует —
он имеет приоритет над панелью.

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
<summary><b>Тарифные планы (DEPRECATED — legacy bootstrap)</b></summary>

> ⚠️ **Deprecated.** С появлением Custom Tariffs тарифы хранятся в БД и
> управляются через админку. Эти поля используются **только** при первом старте
> на пустой БД — для bootstrap тарифа `legacy-default`. После bootstrap правьте
> тарифы в web/bot admin, а не здесь. См. раздел [Custom Tariffs](#-custom-tariffs-кастомные-тарифы).

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

# Пакеты трафика (legacy, опционально)
TRAFFIC_PACKAGES=10:199,50:799

# Нижняя граница пропорциональной цены addon (глобальный fallback;
# переопределяется min_price на уровне тарифа)
MIN_PRORATED_PRICE_RUB=
MIN_PRORATED_PRICE_STARS=
```

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
| `SUBSCRIPTION_PAGE_CONFIG_UUID` | UUID Subscription Page для вкладок «Устройства»/«Инструкция» (пусто = конфиг «Default» из панели) |
| `SUBSCRIPTION_PAGE_CONFIG_PATH` | Опциональный офлайн-override: путь к смонтированному `app-config-v2.json` (приоритет над панелью) |

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
| GET | `/api/subscription/plans` | Доступные тарифы (catalog) |
| GET | `/api/subscription/addons` | Доступные addon для активного standalone |
| GET | `/api/subscription/entitlements` | Активные standalone/addon пользователя |
| PATCH | `/api/subscription/entitlements/{id}/auto-renew` | Автопродление entitlement |
| GET | `/api/subscription/connection` | Ссылка на конфиг |
| PATCH | `/api/subscription/auto-renew` | Автопродление (legacy) |
| GET | `/api/payments` | История платежей |
| POST | `/api/payments/create` | Создать платёж |
| GET | `/api/payments/{id}/status` | Статус платежа |
| POST | `/api/promo/apply` | Применить промокод |
| GET | `/api/referral` | Реферальная статистика |
| GET/DELETE | `/api/devices` | Список устройств / отключить |
| GET | `/api/devices/app-config` | Конфиг Subscription Page (приложения + инструкции) |
| GET/POST | `/api/support/tickets` | Список тикетов / создать тикет |
| GET | `/api/support/tickets/{id}` | Детали тикета |
| POST | `/api/support/tickets/{id}/messages` | Отправить сообщение |
| POST | `/api/support/tickets/{id}/close` | Закрыть тикет |
| GET | `/api/support/stream` | SSE real-time поток поддержки |
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
| GET/POST/PATCH/DELETE | `/admin/plans` | Тарифные планы (Custom Tariffs) |
| POST/PATCH/DELETE | `/admin/plans/{id}/options/...` | Варианты тарифа |
| GET | `/admin/remnawave/squads` | Список Internal Squads из Remnawave |
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
| GET | `/admin/panel/users/{uuid}` | Детали пользователя панели |
| GET | `/admin/support/tickets` | Тикеты поддержки |
| GET | `/admin/support/tickets/{id}` | Детали тикета |
| POST | `/admin/support/tickets/{id}/messages` | Ответить пользователю |
| POST | `/admin/support/tickets/{id}/take\|close` | Взять в работу / закрыть |
| GET | `/admin/support/stream` | SSE поток уведомлений поддержки |

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
