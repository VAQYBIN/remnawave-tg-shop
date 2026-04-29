# Admin Panel — Чек-лист реализации

> **Правило:** При реализации каждого пункта использовать `context7` MCP для получения актуальной документации по соответствующим библиотекам.
>
> **context7 IDs:** `fastapi`, `sqlalchemy`, `pydantic`, `react-router`, `shadcn-ui`, `tailwindcss`, `tanstack-react-query`, `react-i18next`, `httpx`, `redis-py`, `vite`

---

## Фаза 1: Фундамент админки

> **context7:** `fastapi`, `sqlalchemy`, `react-router`, `shadcn-ui`, `tailwindcss`, `tanstack-react-query`

### Backend

- [x] **1.1** Создать модель `SiteSettings` в `db/models.py` (single-row: brand_name, colors, feature toggles)
- [x] **1.2** Создать Alembic-миграцию для `SiteSettings` с seed-данными (INSERT дефолтных значений)
- [x] **1.3** Создать `web/dependencies.py::get_current_admin` — проверка `account.telegram_user_id in ADMIN_IDS`
- [x] **1.4** Создать `web/routers/admin/__init__.py` — AdminRouter с prefix `/api/admin`
- [x] **1.5** Создать `web/routers/admin/auth.py` — `GET /api/admin/me` (возвращает инфо админа)
- [x] **1.6** Создать `web/routers/admin/dashboard.py` — `GET /api/admin/dashboard` (счётчики из БД)
- [x] **1.7** Создать `web/schemas/admin/` — базовые схемы (`AdminMeResponse`, `DashboardResponse`)
- [x] **1.8** Подключить `admin_router` в `web/main.py`
- [x] **1.9** Проверить: запрос на `/api/admin/me` с токеном не-админа → 403
- [x] **1.10** Проверить: запрос на `/api/admin/me` с токеном админа → 200

### Frontend

- [x] **1.11** Создать `frontend/src/api/admin/index.ts` — API-клиент для админки
- [x] **1.12** Создать `frontend/src/api/admin/dashboard.ts` — запросы dashboard + me
- [x] **1.13** Создать `frontend/src/components/admin/AdminSidebar.tsx` — навигация админки
- [x] **1.14** Создать `frontend/src/pages/admin/AdminLayout.tsx` — layout с AdminSidebar
- [x] **1.15** Создать `frontend/src/pages/admin/AdminDashboardPage.tsx` — каркас со StatsCard
- [x] **1.16** Создать `frontend/src/components/admin/StatsCard.tsx` — карточка метрики
- [x] **1.17** Добавить `AdminRoute` guard в auth (проверка `/api/admin/me` при входе)
- [x] **1.18** Добавить роуты `/admin/*` в `App.tsx` с `AdminRoute` guard
- [x] **1.19** Добавить ссылку на админку в основной sidebar (только для админов)
- [x] **1.20** Проверить: не-админ не видит ссылку на админку и не может зайти на `/admin`

### Ручная проверка Фазы 1
- [x] Админ может войти в `/admin` и видит пустой dashboard со счётчиками
- [x] Обычный пользователь не может зайти на `/admin/*` роуты
- [x] API `/api/admin/*` возвращает 403 для не-админов

---

## Фаза 2: Кастомизация сайта

> **context7:** `fastapi`, `shadcn-ui`, `tailwindcss`

### Backend

- [x] **2.1** Создать `core/dal/site_settings_dal.py` — get_settings, update_settings
- [x] **2.2** Создать `web/routers/admin/branding.py` — `GET /api/admin/branding`, `PATCH /api/admin/branding`
- [x] **2.3** Добавить `POST /api/admin/branding/logo` — загрузка файла логотипа (сохранение в `static/`)
- [x] **2.4** Создать `web/routers/admin/features.py` — `GET /api/admin/features`, `PATCH /api/admin/features`
- [x] **2.5** Создать публичный `GET /api/config/branding` (без auth) — бренд + цвета + features для SPA
- [x] **2.6** Создать `web/schemas/admin/branding.py` — `BrandingResponse`, `BrandingUpdateRequest`
- [x] **2.7** Создать `web/schemas/admin/features.py` — `FeaturesResponse`, `FeaturesUpdateRequest`
- [x] **2.8** Добавить раздачу статики (`/static/`) для логотипов в FastAPI

### Frontend

- [x] **2.9** Создать `frontend/src/api/admin/branding.ts` — запросы бренда и features
- [x] **2.10** Создать `frontend/src/pages/admin/BrandingPage.tsx` — форма: название, цвета (color picker), загрузка лого
- [x] **2.11** Создать `frontend/src/pages/admin/FeaturesPage.tsx` — toggle-переключатели (новости, рефералы, устройства)
- [x] **2.12** Создать хук `useBranding()` — загрузка `GET /api/config/branding` при старте SPA
- [x] **2.13** Применение CSS variables из branding config (dynamic theme)
- [x] **2.14** Условный рендеринг: скрывать разделы (новости/рефералы/устройства) по features config
- [x] **2.15** Добавить роуты `/admin/branding` и `/admin/features` в `App.tsx`
- [x] **2.16** Добавить пункты в AdminSidebar

### Ручная проверка Фазы 2
- [x] Можно изменить название бренда → отображается на сайте
- [x] Можно изменить primary color → CSS variables обновляются
- [x] Можно загрузить логотип → отображается в header
- [x] Можно выключить раздел «Новости» → раздел исчезает из навигации и роутов
- [x] Публичный `/api/config/branding` доступен без авторизации

---

## Фаза 3: Тарифы и платёжные провайдеры

> **context7:** `fastapi`, `sqlalchemy`, `shadcn-ui`, `tanstack-react-query`

### Backend

- [x] **3.1** Создать модели `PricingPlan`, `PaymentProviderConfig` в `db/models.py`
- [x] **3.2** Создать Alembic-миграцию + seed (перенос текущих тарифов из env vars)
- [x] **3.3** Создать `core/dal/pricing_plan_dal.py` — CRUD операции
- [x] **3.4** Создать `core/dal/payment_provider_config_dal.py` — get_all, update
- [x] **3.5** Создать `web/routers/admin/plans.py` — CRUD `/api/admin/plans`
- [x] **3.6** Создать `web/routers/admin/payment_providers.py` — GET/PATCH `/api/admin/payment-providers`
- [x] **3.7** Создать `web/schemas/admin/plans.py` — схемы тарифов
- [x] **3.8** Создать `web/schemas/admin/payment_providers.py` — схемы провайдеров
- [x] **3.9** Адаптировать `GET /api/subscription/plans` — читать из БД (`PricingPlan`) вместо env vars
- [x] **3.10** Адаптировать логику создания платежей — использовать `PaymentProviderConfig` для проверки enabled и порядка

### Frontend

- [x] **3.11** Создать `frontend/src/api/admin/plans.ts` — API-клиент тарифов
- [x] **3.12** Создать `frontend/src/api/admin/payment-providers.ts` — API-клиент провайдеров
- [x] **3.13** Создать `frontend/src/pages/admin/PlansPage.tsx` — таблица тарифов + модалка создания/редактирования
- [x] **3.14** Создать `frontend/src/pages/admin/PaymentProvidersPage.tsx` — список с toggle и сортировкой
- [x] **3.15** Добавить роуты и пункты sidebar

### Ручная проверка Фазы 3
- [x] Можно создать новый тарифный план → он появляется на странице подписки
- [x] Можно отключить тариф → он исчезает из публичной страницы
- [x] Можно изменить цену → новая цена отображается
- [x] Можно отключить платёжный провайдер → он не отображается при оплате
- [x] Порядок провайдеров сохраняется после drag-n-drop

---

## Фаза 4: Управление пользователями

> **context7:** `fastapi`, `shadcn-ui`, `tanstack-react-query`

### Backend

- [x] **4.1** Создать `web/routers/admin/users.py`:
  - `GET /api/admin/users` — пагинация, поиск (email, username, telegram_id), фильтры (banned, has_subscription)
  - `GET /api/admin/users/{user_id}` — детали: account + user + подписка + последние платежи + данные панели
  - `POST /api/admin/users/{user_id}/ban` — забанить
  - `POST /api/admin/users/{user_id}/unban` — разбанить
  - `POST /api/admin/users/{user_id}/add-days` — добавить дни подписки (через panel API)
  - `POST /api/admin/users/{user_id}/add-traffic` — добавить трафик (через panel API)
- [x] **4.2** Создать `web/schemas/admin/users.py` — `AdminUserListResponse`, `AdminUserDetailResponse`, action requests
- [x] **4.3** Расширить `core/dal/user_dal.py` — методы для пагинированного поиска
- [x] **4.4** Расширить `panel_client.py` — методы для add-days (`extend_subscription`), add-traffic (`extend_traffic`)

### Frontend

- [x] **4.5** Создать `frontend/src/components/admin/DataTable.tsx` — переиспользуемая таблица с пагинацией, сортировкой, поиском
- [x] **4.6** Создать `frontend/src/api/admin/users.ts` — API-клиент
- [x] **4.7** Создать `frontend/src/pages/admin/AdminUsersPage.tsx` — DataTable с фильтрами
- [x] **4.8** Создать `frontend/src/pages/admin/AdminUserDetailPage.tsx` — карточка юзера с табами (инфо, подписка, платежи, панель)
- [x] **4.9** Модалки: бан (с причиной), выдача дней (input кол-ва), выдача трафика
- [x] **4.10** Добавить роуты `/admin/users`, `/admin/users/:id`

### Ручная проверка Фазы 4
- [x] Таблица пользователей загружается с пагинацией
- [x] Поиск по email/username/telegram_id работает
- [x] Детали юзера показывают всю информацию (аккаунт + подписка + платежи)
- [x] Бан юзера → он не может войти
- [x] Выдача дней → подписка продлена (проверить в панели Remnawave)
- [x] Выдача трафика → трафик увеличен

---

## Фаза 5: Платежи и промокоды

> **context7:** `fastapi`, `shadcn-ui`, `tanstack-react-query`

### Backend

- [x] **5.1** Создать `web/routers/admin/payments.py`:
  - `GET /api/admin/payments` — пагинация, фильтры (статус, провайдер, период, user_id)
  - `GET /api/admin/payments/stats` — доход: сегодня, неделя, месяц, всего; по провайдерам; график по дням
- [x] **5.2** Создать `web/routers/admin/promos.py`:
  - `GET /api/admin/promos` — список с пагинацией
  - `POST /api/admin/promos` — создать (тип, значение, макс. активации, срок)
  - `PATCH /api/admin/promos/{id}` — обновить
  - `DELETE /api/admin/promos/{id}` — удалить
- [x] **5.3** Создать `web/schemas/admin/payments.py` — `PaymentListResponse`, `PaymentStatsResponse`
- [x] **5.4** Создать `web/schemas/admin/promos.py` — `PromoListResponse`, `PromoCreateRequest`, `PromoUpdateRequest`
- [x] **5.5** Расширить `core/dal/payment_dal.py` — методы для фильтрованного поиска, агрегации дохода

### Frontend

- [x] **5.6** Создать `frontend/src/api/admin/payments.ts`
- [x] **5.7** Создать `frontend/src/api/admin/promos.ts`
- [x] **5.8** Создать `frontend/src/pages/admin/AdminPaymentsPage.tsx` — таблица + фильтры + карточки статистики
- [x] **5.9** Добавить графики дохода (по дням, по провайдерам) — recharts BarChart
- [x] **5.10** Создать `frontend/src/pages/admin/AdminPromosPage.tsx` — таблица + модалка создания
- [x] **5.11** Добавить роуты и пункты sidebar

### Ручная проверка Фазы 5
- [ ] Таблица платежей загружается с фильтрами по статусу/провайдеру/периоду
- [ ] Статистика дохода: карточки (сегодня/неделя/месяц) отображают корректные суммы
- [ ] Графики дохода рендерятся
- [ ] Можно создать промокод → он применяется при покупке
- [ ] Можно отредактировать промокод (макс. активации, срок)
- [ ] Можно удалить промокод

---

## Фаза 6: Мониторинг Remnawave

> **context7:** `fastapi`, `httpx`, `shadcn-ui`, `tanstack-react-query`
>
> **Важно:** Использовать `context7` с ID `remnawave` для получения актуальной документации Remnawave API v2.7.0+

### Backend

- [ ] **6.1** Расширить `core/services/panel_client.py` новыми методами:
  - `get_system_stats()` → `GET /api/system/stats`
  - `get_system_metadata()` → `GET /api/system/metadata`
  - `get_bandwidth_stats()` → `GET /api/system/stats/bandwidth`
  - `get_nodes_stats()` → `GET /api/system/stats/nodes`
  - `get_nodes_bandwidth(date_from, date_to)` → `GET /api/bandwidth-stats/nodes`
  - `get_nodes_realtime()` → `GET /api/bandwidth-stats/nodes/realtime`
  - `get_all_nodes()` → `GET /api/nodes`
  - `get_node_by_uuid(uuid)` → `GET /api/nodes/{uuid}`
  - `enable_node(uuid)` → `POST /api/nodes/{uuid}/actions/enable`
  - `disable_node(uuid)` → `POST /api/nodes/{uuid}/actions/disable`
  - `restart_node(uuid)` → `POST /api/nodes/{uuid}/actions/restart`
  - `restart_all_nodes()` → `POST /api/nodes/actions/restart-all`
  - `get_node_users_bandwidth(node_uuid)` → `GET /api/bandwidth-stats/nodes/{uuid}/users`
  - `get_hwid_stats()` → `GET /api/hwid/devices/stats`
- [ ] **6.2** Создать `web/routers/admin/panel_stats.py`:
  - `GET /api/admin/panel/stats` — CPU, RAM, юзеры, онлайн
  - `GET /api/admin/panel/metadata` — версия панели
  - `GET /api/admin/panel/bandwidth` — bandwidth за период
  - `GET /api/admin/panel/bandwidth/realtime` — realtime
- [ ] **6.3** Создать `web/routers/admin/panel_nodes.py`:
  - `GET /api/admin/panel/nodes` — список нод
  - `GET /api/admin/panel/nodes/{uuid}` — детали ноды
  - `POST /api/admin/panel/nodes/{uuid}/enable`
  - `POST /api/admin/panel/nodes/{uuid}/disable`
  - `POST /api/admin/panel/nodes/{uuid}/restart`
  - `POST /api/admin/panel/nodes/restart-all`
- [ ] **6.4** Создать `web/routers/admin/panel_users.py`:
  - `GET /api/admin/panel/users` — юзеры панели (пагинация)
  - `GET /api/admin/panel/users/{uuid}` — детали
- [ ] **6.5** Создать `web/schemas/admin/panel.py` — схемы для panel endpoints

### Frontend

- [ ] **6.6** Создать `frontend/src/api/admin/panel.ts` — API-клиент для panel endpoints
- [ ] **6.7** Создать `frontend/src/pages/admin/PanelStatsPage.tsx`:
  - StatsCards: CPU, RAM, users online, total users, версия панели
  - Графики bandwidth (по нодам, за 7 дней)
  - HWID статистика
- [ ] **6.8** Создать `frontend/src/pages/admin/NodesPage.tsx`:
  - Таблица нод (имя, статус, трафик, онлайн юзеры)
  - Кнопки: enable/disable/restart для каждой ноды
  - Кнопка «Restart All»
  - Индикаторы статуса (зелёный/красный/жёлтый)
- [ ] **6.9** Создать `frontend/src/pages/admin/NodeDetailPage.tsx`:
  - Детали ноды
  - Bandwidth за период (график)
  - Топ юзеров по трафику на этой ноде
- [ ] **6.10** Auto-refresh: polling каждые 30 сек для realtime данных (TanStack Query refetchInterval)
- [ ] **6.11** Добавить роуты `/admin/panel`, `/admin/nodes`, `/admin/nodes/:uuid`
- [ ] **6.12** Добавить секцию «Remnawave» в AdminSidebar

### Ручная проверка Фазы 6
- [ ] Страница статистики показывает CPU/RAM/users с панели
- [ ] Версия панели отображается
- [ ] Графики bandwidth рендерятся с реальными данными
- [ ] Список нод загружается со статусами
- [ ] Enable/Disable ноды работает → статус обновляется
- [ ] Restart ноды работает
- [ ] Детали ноды показывают bandwidth и топ юзеров
- [ ] Данные авто-обновляются каждые 30 сек

---

## Фаза 7: Рассылка и финальный Dashboard

> **context7:** `fastapi`, `redis-py`, `shadcn-ui`, `tanstack-react-query`

### Backend

- [ ] **7.1** Создать `web/routers/admin/broadcast.py`:
  - `POST /api/admin/broadcast` — отправка (текст, фильтры: всем / с подпиской / без подписки)
  - `GET /api/admin/broadcast/status/{id}` — статус рассылки
- [ ] **7.2** Механизм: Redis Pub/Sub для передачи рассылки боту
  - Web API публикует в канал `broadcast:request` → JSON {id, text, filters}
  - Бот подписан на канал → выполняет рассылку → публикует прогресс в `broadcast:status:{id}`
  - Web API подписывается на `broadcast:status:{id}` для статуса
- [ ] **7.3** Бот: создать обработчик Redis Pub/Sub для broadcast (в `bot/services/`)
- [ ] **7.4** Финализировать `GET /api/admin/dashboard`:
  - Юзеры: всего, новые сегодня, новые за 7 дней
  - Доход: сегодня, за 7 дней, за 30 дней
  - Подписки: активные, истекающие в 3 дня
  - Последние 5 платежей
  - Статус нод (мини-карточки с panel API)

### Frontend

- [ ] **7.5** Создать `frontend/src/pages/admin/BroadcastPage.tsx`:
  - Textarea для сообщения
  - Фильтры получателей (всем / с подпиской / без)
  - Preview
  - Кнопка отправки с подтверждением
  - Прогресс-бар (polling статуса)
- [ ] **7.6** Финализировать `AdminDashboardPage.tsx`:
  - Ряд StatsCards (юзеры, доход, подписки)
  - Графики: регистрации и платежи за 30 дней
  - Мини-статус нод Remnawave
  - Таблица последних платежей
- [ ] **7.7** Добавить роут `/admin/broadcast` и пункт sidebar

### Ручная проверка Фазы 7
- [ ] Dashboard показывает актуальные метрики из БД и панели
- [ ] Графики на Dashboard рендерятся корректно
- [ ] Рассылка отправляется через Redis → бот получает → доставляет
- [ ] Прогресс рассылки отображается в реальном времени
- [ ] Фильтры получателей работают (только с подпиской / только без)

---

## Фаза 8: Полировка

> **context7:** `react-i18next`, `tailwindcss`

- [ ] **8.1** i18n: добавить все тексты админки в `ru.json` и `en.json`
- [ ] **8.2** Mobile-responsive: адаптировать AdminLayout (collapsible sidebar, мобильное меню)
- [ ] **8.3** Rate limiting: добавить ограничения на admin-эндпоинты (защита от abuse)
- [ ] **8.4** Audit log: логирование действий админа (бан, выдача дней, рассылка, изменение настроек) в `MessageLog`
- [ ] **8.5** Error boundaries: обёртка для admin-страниц
- [ ] **8.6** Toast уведомления: для всех действий (успех, ошибка)
- [ ] **8.7** Оптимизация: debounce поиска, кеширование (staleTime в TanStack Query)
- [ ] **8.8** Confirm dialogs: для опасных действий (бан, удаление, restart, рассылка)
- [ ] **8.9** Loading states и skeleton screens для таблиц и графиков
- [ ] **8.10** Обновить `CLAUDE.md` — добавить документацию по админке

### Ручная проверка Фазы 8
- [ ] Все тексты переведены на ru и en
- [ ] Админка корректно отображается на мобильных устройствах
- [ ] Действия админа логируются в БД
- [ ] Опасные действия требуют подтверждения
- [ ] Ошибки API отображаются через toast
- [ ] Поиск не спамит запросами (debounce работает)

---

## Итого

| Фаза | Пунктов | Описание |
|-------|---------|----------|
| 1 | 20 | Фундамент (каркас, auth, пустой dashboard) |
| 2 | 16 | Кастомизация сайта (бренд, цвета, features) |
| 3 | 15 | Тарифы и платёжные провайдеры |
| 4 | 10 | Управление пользователями |
| 5 | 11 | Платежи и промокоды |
| 6 | 12 | Мониторинг Remnawave (ноды, stats, bandwidth) |
| 7 | 7 | Рассылка и финальный dashboard |
| 8 | 10 | Полировка (i18n, responsive, audit, UX) |
| **Всего** | **101** | |
