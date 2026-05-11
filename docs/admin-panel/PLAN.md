# Admin Panel — Детальный план реализации

## Обзор

Панель администратора как часть существующего SPA (`/admin/*` роуты) с двумя основными блоками:
1. **Кастомизация сайта** — бренд, цвета, логотип, управление разделами, тарифами, платёжками
2. **Мониторинг и управление** — серверы Remnawave, пользователи, подписки, платежи, промокоды, рассылки

**Аутентификация:** существующий `ADMIN_IDS` (Telegram ID). Вход через Telegram OAuth или email+пароль.
Аккаунт считается админом, если `account.telegram_user_id IN ADMIN_IDS`.

---

## Архитектура

### Backend (web/)

```
web/
├── routers/
│   └── admin/
│       ├── __init__.py           # AdminRouter, подключение sub-routers
│       ├── auth.py               # GET /api/admin/me — проверка прав
│       ├── dashboard.py          # GET /api/admin/dashboard — сводка
│       ├── branding.py           # CRUD /api/admin/branding — кастомизация
│       ├── features.py           # CRUD /api/admin/features — вкл/выкл разделов
│       ├── plans.py              # CRUD /api/admin/plans — тарифы
│       ├── payment_providers.py  # CRUD /api/admin/payment-providers
│       ├── users.py              # /api/admin/users — управление юзерами
│       ├── payments.py           # /api/admin/payments — просмотр оплат
│       ├── promos.py             # CRUD /api/admin/promos — промокоды
│       ├── broadcast.py          # POST /api/admin/broadcast — рассылка
│       ├── panel_nodes.py        # /api/admin/panel/nodes — ноды Remnawave
│       ├── panel_stats.py        # /api/admin/panel/stats — статистика панели
│       └── panel_users.py        # /api/admin/panel/users — юзеры панели
├── schemas/
│   └── admin/                    # Pydantic-схемы для админки
├── middleware/
│   └── admin_auth.py             # Dependency: get_current_admin
```

### Frontend (frontend/src/)

```
frontend/src/
├── pages/admin/
│   ├── AdminLayout.tsx           # Layout с sidebar для админки
│   ├── AdminDashboardPage.tsx    # Сводная панель
│   ├── BrandingPage.tsx          # Кастомизация бренда
│   ├── FeaturesPage.tsx          # Управление разделами
│   ├── PlansPage.tsx             # Тарифные планы
│   ├── PaymentProvidersPage.tsx  # Платёжные провайдеры
│   ├── AdminUsersPage.tsx        # Пользователи (таблица + поиск)
│   ├── AdminUserDetailPage.tsx   # Детали юзера + действия
│   ├── AdminPaymentsPage.tsx     # Платежи (таблица + фильтры)
│   ├── AdminPromosPage.tsx       # Промокоды (таблица + создание)
│   ├── BroadcastPage.tsx         # Рассылка
│   ├── NodesPage.tsx             # Ноды Remnawave
│   ├── NodeDetailPage.tsx        # Детали ноды + bandwidth
│   └── PanelStatsPage.tsx        # Системная статистика панели
├── components/admin/
│   ├── AdminSidebar.tsx
│   ├── StatsCard.tsx
│   ├── DataTable.tsx             # Переиспользуемая таблица с пагинацией
│   ├── charts/                   # Графики (bandwidth, платежи)
│   └── forms/                    # Формы (промокод, бренд, тариф)
├── api/admin/                    # API-клиенты для админки
└── hooks/admin/                  # React Query хуки
```

### База данных — новые модели

```python
# SiteSettings — кастомизация сайта (single-row, как PanelSyncStatus)
class SiteSettings(Base):
    __tablename__ = "site_settings"
    id: int (PK, единственная строка)
    brand_name: str               # "VPN"
    logo_url: Optional[str]       # URL или путь к логотипу
    favicon_url: Optional[str]
    primary_color: str            # "#2AACDF"
    secondary_color: str          # "#897569"
    background_color: str         # "#F5F1ED"
    font_family: str              # "Nunito"
    custom_css: Optional[str]     # доп. CSS
    # Переключатели разделов
    news_enabled: bool            # default True
    referral_enabled: bool        # default True (+ sync с Settings.REFERRAL_ENABLED)
    devices_enabled: bool         # default True (+ sync с Settings.MY_DEVICES_SECTION_ENABLED)
    # Метаданные
    updated_at: datetime
```

```python
# Тарифные планы переносятся из env vars в БД
class PricingPlan(Base):
    __tablename__ = "pricing_plans"
    id: int (PK)
    duration_months: int          # 1, 3, 6, 12
    price_rub: Decimal
    price_stars: Optional[int]
    is_enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

# Платёжные провайдеры — конфигурация в БД
class PaymentProviderConfig(Base):
    __tablename__ = "payment_provider_configs"
    id: int (PK)
    provider_key: str (unique)    # "yookassa", "freekassa", etc.
    display_name: str
    is_enabled: bool
    sort_order: int
    # Credentials хранятся в env vars, тут только вкл/выкл и порядок
    updated_at: datetime
```

### Dependency: проверка админа

```python
# web/dependencies.py
async def get_current_admin(
    account: Account = Depends(get_current_account),
    settings: Settings = Depends(get_settings)
) -> Account:
    if not account.telegram_user_id:
        raise HTTPException(403, "Admin access requires linked Telegram")
    if account.telegram_user_id not in settings.ADMIN_IDS:
        raise HTTPException(403, "Not an admin")
    return account
```

---

## Remnawave Panel API — используемые эндпоинты

> **Важно:** При реализации использовать `context7` для получения актуальной документации Remnawave API.

### Статистика и мониторинг (только чтение)

| Эндпоинт | Назначение в админке |
|-----------|---------------------|
| `GET /api/system/stats` | Сводка: CPU, RAM, кол-во юзеров, онлайн |
| `GET /api/system/metadata` | Версия панели |
| `GET /api/system/stats/bandwidth` | Общий трафик |
| `GET /api/system/stats/nodes` | Статистика нод (7 дней) |
| `GET /api/bandwidth-stats/nodes` | Трафик по нодам за период |
| `GET /api/bandwidth-stats/nodes/realtime` | Realtime трафик нод |
| `GET /api/bandwidth-stats/nodes/{uuid}/users` | Трафик юзеров на ноде |
| `GET /api/bandwidth-stats/users/{uuid}` | Трафик конкретного юзера |
| `GET /api/hwid/devices/stats` | Статистика устройств |
| `GET /api/subscription-request-history/stats` | Статистика запросов подписок |

### Управление нодами

| Эндпоинт | Назначение |
|-----------|-----------|
| `GET /api/nodes` | Список всех нод |
| `GET /api/nodes/{uuid}` | Детали ноды |
| `POST /api/nodes/{uuid}/actions/enable` | Включить ноду |
| `POST /api/nodes/{uuid}/actions/disable` | Выключить ноду |
| `POST /api/nodes/{uuid}/actions/restart` | Перезагрузить ноду |
| `POST /api/nodes/actions/restart-all` | Перезагрузить все ноды |

### Пользователи панели (просмотр)

| Эндпоинт | Назначение |
|-----------|-----------|
| `GET /api/users?start=&size=` | Список юзеров (пагинация) |
| `GET /api/users/{uuid}` | Детали юзера |
| `GET /api/users/by-telegram-id/{id}` | Поиск по Telegram ID |
| `GET /api/users/by-username/{name}` | Поиск по username |
| `POST /api/users/{uuid}/actions/enable` | Включить юзера |
| `POST /api/users/{uuid}/actions/disable` | Выключить юзера |
| `POST /api/users/{uuid}/actions/reset-traffic` | Сбросить трафик |

---

## API-эндпоинты админки

### Аутентификация и сводка

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/me` | Проверка прав админа |
| GET | `/api/admin/dashboard` | Сводка: юзеры, платежи, подписки, доход |

### Кастомизация сайта

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/branding` | Текущие настройки бренда |
| PATCH | `/api/admin/branding` | Обновить бренд (название, цвета, лого) |
| POST | `/api/admin/branding/logo` | Загрузить логотип (файл) |
| GET | `/api/admin/features` | Статус разделов (вкл/выкл) |
| PATCH | `/api/admin/features` | Обновить статус разделов |

### Тарифы и провайдеры

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/plans` | Список тарифных планов |
| POST | `/api/admin/plans` | Создать тариф |
| PATCH | `/api/admin/plans/{id}` | Обновить тариф |
| DELETE | `/api/admin/plans/{id}` | Удалить тариф |
| GET | `/api/admin/payment-providers` | Список платёжных провайдеров |
| PATCH | `/api/admin/payment-providers/{id}` | Обновить провайдер (вкл/выкл, порядок) |

### Пользователи магазина

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/users` | Список юзеров (пагинация, поиск, фильтры) |
| GET | `/api/admin/users/{id}` | Детали юзера (+ подписка, платежи, панель) |
| POST | `/api/admin/users/{id}/ban` | Забанить |
| POST | `/api/admin/users/{id}/unban` | Разбанить |
| POST | `/api/admin/users/{id}/add-days` | Выдать дни подписки |
| POST | `/api/admin/users/{id}/add-traffic` | Выдать трафик |

### Платежи

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/payments` | Список платежей (пагинация, фильтры) |
| GET | `/api/admin/payments/stats` | Статистика: доход по периодам, по провайдерам |

### Промокоды

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/promos` | Список промокодов |
| POST | `/api/admin/promos` | Создать промокод |
| PATCH | `/api/admin/promos/{id}` | Обновить |
| DELETE | `/api/admin/promos/{id}` | Удалить |

### Рассылка

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/admin/broadcast` | Отправить сообщение (текст, фильтры) |
| GET | `/api/admin/broadcast/status/{id}` | Статус рассылки |

### Remnawave Panel (проксированные)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/admin/panel/stats` | Системная статистика |
| GET | `/api/admin/panel/metadata` | Версия панели |
| GET | `/api/admin/panel/bandwidth` | Bandwidth статистика |
| GET | `/api/admin/panel/bandwidth/realtime` | Realtime bandwidth |
| GET | `/api/admin/panel/nodes` | Список нод |
| GET | `/api/admin/panel/nodes/{uuid}` | Детали ноды |
| POST | `/api/admin/panel/nodes/{uuid}/enable` | Включить ноду |
| POST | `/api/admin/panel/nodes/{uuid}/disable` | Выключить ноду |
| POST | `/api/admin/panel/nodes/{uuid}/restart` | Перезагрузить ноду |
| POST | `/api/admin/panel/nodes/restart-all` | Перезагрузить все |
| GET | `/api/admin/panel/users` | Юзеры панели (пагинация) |
| GET | `/api/admin/panel/users/{uuid}` | Детали юзера панели |

---

## Фазы реализации

### Фаза 1: Фундамент админки
**Цель:** каркас backend + frontend, аутентификация админа, пустой dashboard.

**Backend:**
1. Модель `SiteSettings` + миграция
2. `get_current_admin` dependency
3. Router `/api/admin/me` — проверка прав
4. Router `/api/admin/dashboard` — заглушка со счётчиками из БД
5. Подключение admin-роутеров в `web/main.py`

**Frontend:**
6. `AdminLayout.tsx` с sidebar навигацией
7. `AdminRoute` guard (проверка `GET /api/admin/me`)
8. Роутинг `/admin/*` в `App.tsx`
9. `AdminDashboardPage.tsx` — каркас со StatsCard
10. API-клиент `api/admin/`

**context7:** `fastapi`, `react-router`, `shadcn-ui`, `tailwindcss`, `tanstack-react-query`

---

### Фаза 2: Кастомизация сайта
**Цель:** управление брендом, цветами, логотипом, включение/выключение разделов.

**Backend:**
1. DAL: `site_settings_dal.py`
2. Router: `branding.py` — GET/PATCH + загрузка логотипа
3. Router: `features.py` — GET/PATCH разделов
4. Публичный эндпоинт `GET /api/config/branding` — для фронтенда (без auth)

**Frontend:**
5. `BrandingPage.tsx` — форма: название, цвета (color picker), загрузка логотипа
6. `FeaturesPage.tsx` — toggle-переключатели разделов
7. Применение branding: загрузка настроек при старте SPA → CSS variables
8. Условный рендеринг разделов по features config

**context7:** `fastapi`, `shadcn-ui`, `tailwindcss`

---

### Фаза 3: Тарифы и платёжные провайдеры
**Цель:** управление тарифными планами и провайдерами из админки.

**Backend:**
1. Модели `PricingPlan`, `PaymentProviderConfig` + миграция
2. DAL: `pricing_plan_dal.py`, `payment_provider_config_dal.py`
3. Router: `plans.py` — CRUD тарифов
4. Router: `payment_providers.py` — GET/PATCH провайдеров
5. Миграция данных: из env vars → начальные записи в БД (seed)
6. Адаптация `GET /api/subscription/plans` — читать из БД вместо env

**Frontend:**
7. `PlansPage.tsx` — таблица + модалка создания/редактирования
8. `PaymentProvidersPage.tsx` — список с toggle и drag-n-drop сортировкой

**context7:** `fastapi`, `sqlalchemy`, `shadcn-ui`, `tanstack-react-query`

---

### Фаза 4: Управление пользователями
**Цель:** просмотр, поиск, бан, выдача дней/трафика.

**Backend:**
1. Router: `users.py` — список с пагинацией, поиском, фильтрами
2. Детали юзера: аккаунт + подписка + платежи + панель-данные
3. Действия: ban/unban, add-days, add-traffic (через panel API)
4. Schemas: `AdminUserResponse`, `AdminUserDetailResponse`

**Frontend:**
5. `AdminUsersPage.tsx` — DataTable с поиском и фильтрами
6. `AdminUserDetailPage.tsx` — карточка юзера с табами (инфо, подписка, платежи)
7. Модалки действий (бан, выдача дней)
8. Компонент `DataTable` — переиспользуемый с пагинацией и сортировкой

**context7:** `fastapi`, `shadcn-ui`, `tanstack-react-query`

---

### Фаза 5: Платежи и промокоды
**Цель:** просмотр платежей со статистикой, CRUD промокодов.

**Backend:**
1. Router: `payments.py` — список с фильтрами (статус, провайдер, период)
2. Router: `payments.py` — `/stats` — доход по периодам, по провайдерам
3. Router: `promos.py` — CRUD промокодов
4. Schemas для статистики и промокодов

**Frontend:**
5. `AdminPaymentsPage.tsx` — таблица платежей + графики дохода
6. `AdminPromosPage.tsx` — таблица промокодов + модалка создания
7. Компонент графиков (recharts или chart.js) для статистики дохода

**context7:** `fastapi`, `shadcn-ui`, `tanstack-react-query`

---

### Фаза 6: Мониторинг Remnawave
**Цель:** статистика панели, управление нодами, просмотр юзеров панели.

**Backend:**
1. Расширение `panel_client.py` — новые методы для нод, bandwidth, metadata
2. Router: `panel_stats.py` — системная статистика, bandwidth
3. Router: `panel_nodes.py` — список нод, действия (enable/disable/restart)
4. Router: `panel_users.py` — юзеры панели (пагинация, поиск)

**Frontend:**
5. `PanelStatsPage.tsx` — карточки (CPU, RAM, юзеры) + графики bandwidth
6. `NodesPage.tsx` — таблица нод с статусами и кнопками управления
7. `NodeDetailPage.tsx` — детали ноды + bandwidth по юзерам
8. Auto-refresh (polling каждые 30 сек для realtime данных)

**context7:** `fastapi`, `httpx`, `shadcn-ui`, `tanstack-react-query`

---

### Фаза 7: Рассылка и Dashboard
**Цель:** функционал рассылки, финальная сводная панель.

**Backend:**
1. Router: `broadcast.py` — отправка через бот (Redis Pub/Sub)
2. Механизм: web API → Redis message → бот подхватывает и рассылает
3. Статус рассылки через Redis

**Frontend:**
4. `BroadcastPage.tsx` — текстовый редактор + фильтры получателей + preview
5. `AdminDashboardPage.tsx` — финальная версия:
   - Карточки: юзеры (всего/сегодня), доход (сегодня/месяц), активные подписки
   - Графики: регистрации, платежи за 30 дней
   - Статус нод Remnawave (мини-карточки)
   - Последние платежи и действия

**context7:** `fastapi`, `shadcn-ui`, `tanstack-react-query`

---

### Фаза 8: Полировка
**Цель:** i18n, адаптивность, безопасность, оптимизация.

1. i18n для всех текстов админки (ru/en)
2. Mobile-responsive для AdminLayout
3. Rate limiting на admin-эндпоинты
4. Audit log — логирование действий админа
5. Error boundaries + toast уведомления
6. Оптимизация запросов (кеширование, debounce поиска)
7. Обновление `CLAUDE.md` — документация админки

**context7:** `react-i18next`, `tailwindcss`
