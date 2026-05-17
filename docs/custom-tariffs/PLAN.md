# Custom Tariffs — Детальный план реализации

## Обзор

Функционал кастомных тарифов добавляет поддержку нескольких пользовательских тарифов, разных Remnawave Internal Squads, тарифов по сроку, по трафику, смешанных тарифов, пробного периода как тарифа и добавочных тарифов.

Главная цель: **бот и веб-версия должны использовать одну тарифную модель из БД**, без расхождений между Telegram flow и SPA flow.

Базовые правила:

1. У пользователя может быть максимум один активный самостоятельный тариф (`standalone`).
2. При покупке другого самостоятельного тарифа старый `standalone` заменяется новым.
3. Оплаченное время не теряется: новый срок добавляется к текущей дате окончания, если подписка активна, или считается от текущего момента, если подписка истекла.
4. Добавочный тариф (`addon`) можно купить только при наличии активного `standalone`.
5. Добавочный тариф действует до конца текущего самостоятельного тарифа.
6. Цена добавочного тарифа пересчитывается пропорционально оставшемуся времени подписки.
7. ГБ из покупок суммируются с текущим лимитом пользователя.
8. `activeInternalSquads` в Remnawave всегда собирается из активного standalone-сквада и активных addon-сквадов.
9. Старые подписки остаются рабочими как `legacy`.
10. Новые покупки после миграции должны идти через БД-тарифы.
11. Time-only тарифы не должны неявно получать unlimited traffic: лимит трафика выбирается явно в option как GB-лимит или explicit unlimited.
12. При ручном продлении standalone пользователю сразу предлагается bundled-оплата вместе с активными addon, у которых включено автопродление. Addon с отключённым автопродлением не входит в bundle и остаётся активным только до ранее оплаченной даты.

---

## Документация и API-контракты

### Context7

При реализации обязательно использовать Context7 для актуальной документации используемых библиотек:

| Область | Context7 library id |
|---------|---------------------|
| FastAPI | `/fastapi/fastapi` |
| SQLAlchemy 2.0 | `/websites/sqlalchemy_en_20` |
| React Router / React Query / frontend libs | искать через `resolve_library_id` перед реализацией конкретной фазы |

Context7 использовать перед изменением соответствующего слоя, а не только при планировании.

### Remnawave v2.7.4

Реализация должна соблюдать спецификацию Remnawave API v2.7.4.

Критичные поля пользователя Remnawave:

| Поле | Использование |
|------|---------------|
| `activeInternalSquads` | Итоговый список UUID активных Internal Squads пользователя |
| `expireAt` | Общая дата окончания доступа пользователя |
| `trafficLimitBytes` | Суммарный лимит трафика пользователя |
| `trafficLimitStrategy` | Стратегия сброса трафика |
| `status` | `ACTIVE` после успешной покупки/продления |
| `subscriptionUuid` / `shortUuid` | Идентификатор ссылки подписки |
| `subscriptionUrl` | Ссылка подписки для клиента |

Критичные endpoint'ы Remnawave:

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| `GET` | `/internal-squads` | Получить список Internal Squads для выбора тарифа |
| `GET` | `/internal-squads/{uuid}` | Проверить существование конкретного сквада |
| `GET` | `/users/{uuid}` | Получить пользователя и текущие лимиты |
| `POST` | `/users` | Создать пользователя с нужным `activeInternalSquads` |
| `PATCH` | `/users` | Обновить `activeInternalSquads`, `expireAt`, `trafficLimitBytes`, `trafficLimitStrategy`, `status` |
| `POST` | `/users/{uuid}/actions/enable` | Включить пользователя |
| `POST` | `/users/{uuid}/actions/disable` | Отключить пользователя |
| `POST` | `/users/{uuid}/actions/reset-traffic` | Сбросить использованный трафик |

Поддерживаемые стратегии сброса трафика:

```text
NO_RESET
DAY
WEEK
MONTH
MONTH_ROLLING
```

Если Remnawave API недоступно, создание или обновление тарифа с Remnawave squad должно блокироваться. Ручной ввод UUID допустим только как input-метод, но UUID всё равно должен быть проверен через API перед сохранением.

---

## Архитектура

### Backend

```
core/
├── dal/
│   ├── pricing_plan_dal.py          # Тарифы и опции тарифов
│   ├── plan_entitlement_dal.py      # Активные права пользователя на тарифы
│   └── payment_dal.py               # Расширяется plan/payment fields
├── services/
│   ├── panel_client.py              # Remnawave client, включая Internal Squads
│   ├── tariff_pricing.py            # Расчёт цены, min price, prorating, Stars/RUB
│   ├── tariff_activation.py         # Активация тарифов после успешной оплаты
│   ├── tariff_sync.py               # Сборка итогового состояния Remnawave
│   └── tariff_bootstrap.py          # Legacy bootstrap из .env

web/
├── routers/
│   ├── subscription.py              # Публичные тарифы, подписка, дополнения
│   ├── payment.py                   # Создание платежа по plan_option_id
│   └── admin/
│       └── plans.py                 # CRUD тарифов + Remnawave squads picker
└── schemas/
    ├── subscription.py              # Публичные схемы тарифов
    ├── payment.py                   # plan_option_id вместо months
    └── admin/plans.py               # Админские схемы тарифов
```

### Telegram bot

```
bot/
├── handlers/
│   ├── user/subscription/
│   │   ├── core.py                  # Купить -> тариф -> опция -> способ оплаты
│   │   └── payments_*.py            # Создание платежей с plan_option_id
│   └── admin/
│       └── tariffs.py               # Админский flow тарифов
├── keyboards/inline/
│   ├── user_keyboards.py            # Клавиатуры выбора тарифов/опций/addon
│   └── admin_keyboards.py           # Кнопка "Тарифы" и CRUD-клавиатуры
└── states/admin_states.py           # FSM для создания тарифов
```

### Frontend

```
frontend/src/
├── api/
│   ├── subscription.ts              # Тарифы с options, addons, auto-renew
│   ├── payment.ts                   # create payment by plan_option_id
│   └── admin/plans.ts               # CRUD тарифов + squads picker
├── pages/
│   ├── SubscriptionPage.tsx         # Новый purchase flow
│   └── admin/PlansPage.tsx          # Полная форма тарифов
└── components/
    ├── subscription/
    │   ├── TariffSelector.tsx
    │   ├── TariffOptionSelector.tsx
    │   └── AddonSelector.tsx
    └── admin/
        └── TariffForm.tsx
```

---

## Модель данных

### `pricing_plans`

Тариф как продукт.

```python
class PricingPlan(Base):
    __tablename__ = "pricing_plans"

    id: int
    slug: str
    name_ru: str
    name_en: str | None
    description_ru: str | None
    description_en: str | None
    remnawave_squad_uuid: str
    remnawave_squad_name_snapshot: str | None
    plan_kind: str              # standalone | addon
    billing_model: str          # time | traffic | hybrid
    traffic_reset_strategy: str # NO_RESET | DAY | WEEK | MONTH | MONTH_ROLLING
    min_price_rub: float | None
    min_price_stars: int | None
    is_trial: bool
    is_enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime | None
```

`slug` используется как стабильный технический идентификатор для seed/bootstrap тарифов (`legacy-default`, `trial-default`) и интеграционных тестов. Пользовательский роутинг по slug не планируется.

### `pricing_plan_options`

Варианты покупки тарифа.

```python
class PricingPlanOption(Base):
    __tablename__ = "pricing_plan_options"

    id: int
    plan_id: int
    duration_months: int | None
    duration_days: int | None
    traffic_gb: float | None
    traffic_unlimited: bool
    price_rub: float | None
    price_stars: int | None
    is_enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime | None
```

Валидация:

| `billing_model` | Обязательные поля option |
|-----------------|--------------------------|
| `time` | `duration_months` или `duration_days`, а также явный выбор `traffic_gb` или `traffic_unlimited=true` |
| `traffic` | `traffic_gb` |
| `hybrid` | срок + `traffic_gb` |
| `is_trial=true` | `price_rub=0`, `price_stars=null`, срок обязателен |

Правила срока:

1. `duration_days` и `duration_months` нельзя задавать одновременно для новых options.
2. `duration_days` используется для trial и точных коротких периодов.
3. `duration_months` используется для обычных платных тарифов.
4. Legacy/import данные с двумя полями должны нормализоваться при первом редактировании.

Правила трафика:

1. `traffic_unlimited=true` означает явный unlimited и маппится в Remnawave как `trafficLimitBytes=0`.
2. `traffic_gb` означает конкретный GB-лимит или добавляемый объём, в зависимости от типа покупки.
3. Для time-only standalone option админ обязан выбрать `traffic_gb` или `traffic_unlimited=true`; неявного `0` быть не должно.
4. Если текущий standalone explicit unlimited, traffic addon не должен менять `trafficLimitBytes`; такой addon либо скрывается в UI, либо показывается как не влияющий на лимит.

Правила `traffic_reset_strategy`:

1. Для `billing_model=time` допустим только `NO_RESET`.
2. Для `billing_model=traffic` и `billing_model=hybrid` допустимы `NO_RESET`, `DAY`, `WEEK`, `MONTH`, `MONTH_ROLLING`.
3. Стратегия хранится на уровне тарифа для MVP. Перенос на уровень option возможен отдельной будущей доработкой.

### `user_plan_entitlements`

Активное право пользователя на тариф.

```python
class UserPlanEntitlement(Base):
    __tablename__ = "user_plan_entitlements"

    id: int
    user_id: int
    plan_id: int
    plan_option_id: int | None
    starts_at: datetime
    ends_at: datetime | None
    traffic_limit_bytes_added: int
    is_active: bool
    auto_renew_enabled: bool
    deactivated_at: datetime | None
    deactivation_reason: str | None
    created_at: datetime
    updated_at: datetime | None
```

Ограничения:

1. Один активный `standalone` на пользователя.
2. `addon` не может быть активен без активного `standalone`.
3. `addon.ends_at <= standalone.ends_at`.
4. При истечении standalone все addon считаются неактивными.
5. `plan_kind` берётся из `PricingPlan`; менять `plan_kind` у тарифа с entitlements запрещено.
6. `panel_user_uuid` берётся из `User`/`Subscription` и не дублируется в entitlement.
7. Деактивация всегда пишет `deactivated_at` и `deactivation_reason`.

Причины деактивации:

```text
expired
plan_switched
admin_action
standalone_expired
auto_renew_disabled
```

### `entitlement_payments`

Связь entitlements с платежами. Нужна для истории покупок, ручных продлений и auto-renew bundle, где один платёж может продлевать несколько entitlements.

```python
class EntitlementPayment(Base):
    __tablename__ = "entitlement_payments"

    id: int
    entitlement_id: int
    payment_id: int
    purpose: str  # purchase | renewal | addon_proration | admin | trial
    created_at: datetime
```

### `payments`

Добавить поля:

```python
pricing_plan_id: int | None
pricing_plan_option_id: int | None
sale_mode: str | None              # standalone | addon | trial | legacy
traffic_gb: float | None
duration_months: int | None
duration_days: int | None
auto_renew_bundle_snapshot: str | None  # JSON text
activation_status: str | None           # pending | succeeded | pending_panel_sync | failed
needs_panel_sync: bool
```

Старое `subscription_duration_months` оставить для legacy и старых payment provider paths.

Формат `auto_renew_bundle_snapshot`:

```json
{
  "standalone": {
    "entitlement_id": 10,
    "plan_id": 1,
    "option_id": 1,
    "price_rub": 250.0,
    "price_stars": 100
  },
  "addons": [
    {
      "entitlement_id": 13,
      "plan_id": 3,
      "option_id": 5,
      "price_rub": 89.5,
      "price_stars": 35
    }
  ]
}
```

### `subscriptions`

Для совместимости таблица остаётся главным источником текущей подписки для существующих экранов.

Добавить опционально:

```python
pricing_plan_id: int | None
pricing_plan_option_id: int | None
```

Новые тарифы должны дополнительно вести `user_plan_entitlements`.

---

## Правила тарификации

### Standalone

Покупка standalone:

1. Найти или создать Remnawave user.
2. Найти активный standalone entitlement.
3. Если активный standalone есть и не истёк:
   - новый срок считается от `old.ends_at`;
   - старый standalone entitlement деактивируется;
   - новый standalone entitlement создаётся с новым plan.
4. Если активного standalone нет:
   - новый срок считается от `now`.
5. Активные addon entitlements сохраняются.
6. Если ручное продление standalone выполняется при активных addon, пользователю предлагается bundled-оплата вместе с addon, у которых `auto_renew_enabled=true`.
7. Addon с `auto_renew_enabled=false` не входит в bundled-оплату и остаётся активным до старого `ends_at`.
8. Remnawave squads пересобираются из нового standalone + активных addon.

Порядок смены standalone:

1. Рассчитать новое локальное состояние и новый `standalone.ends_at`.
2. Деактивировать старый standalone entitlement локально с `deactivation_reason=plan_switched`.
3. Создать новый standalone entitlement.
4. Добавить/продлить addon entitlements только если они входят в оплаченный bundle.
5. Оставить отключённые от bundle addon до прежней даты.
6. Если после любого изменения standalone какой-либо `addon.ends_at > new_standalone.ends_at`, обрезать `addon.ends_at` до `new_standalone.ends_at`.
7. Собрать итоговый список squads: `[new_standalone.squad] + active_addon_squads`.
8. Одним `PATCH /users` отправить итоговый `activeInternalSquads`, `expireAt`, `trafficLimitBytes`, `trafficLimitStrategy`, `status`.
9. Не отправлять промежуточный PATCH, где одновременно присутствуют старый и новый standalone squad.

### Addon

Покупка addon:

1. Проверить активный standalone.
2. Если standalone нет, покупку заблокировать.
3. Рассчитать цену пропорционально оставшемуся времени standalone.
4. После успешной оплаты создать addon entitlement:
   - `starts_at = now`;
   - `ends_at = standalone.ends_at`.
5. Если addon содержит трафик, добавить ГБ к текущему лимиту.
6. Remnawave squads пересобрать.

Prorating:

```text
remaining_seconds = standalone.ends_at - now
base_seconds = option.duration_days * 86400 или duration_months через add_months(now, months)
price = option.price * remaining_seconds / base_seconds
price = max(price, min_price_for_currency)
```

RUB округлять до копеек или рублей согласно текущей логике провайдера. Stars округлять вверх до целого.

Минимальная цена:

1. Для prorating использовать `PricingPlan.min_price_rub` / `PricingPlan.min_price_stars`.
2. Если на тарифе минимум не задан, использовать глобальные настройки проекта: `MIN_PRORATED_PRICE_RUB`, `MIN_PRORATED_PRICE_STARS`.
3. Цена addon не может быть ниже минимальной суммы провайдера.

### Traffic

Правило: купленный трафик суммируется.

```text
new_traffic_limit_bytes = current_traffic_limit_bytes + purchased_traffic_bytes
```

Исключение: если текущий standalone option выбран как explicit unlimited (`traffic_unlimited=true`, Remnawave `trafficLimitBytes=0`), traffic addon не должен превращать unlimited в ограниченный лимит. В таком случае traffic addon скрывается/блокируется или не изменяет `trafficLimitBytes`.

Стратегия сброса для MVP:

1. Standalone задаёт `trafficLimitStrategy`.
2. Addon не меняет стратегию, только добавляет трафик и/или squad.
3. Для time-only standalone стратегия всегда `NO_RESET`.
4. Если нужны разные стратегии для addon, это отдельная будущая доработка.

### Trial

Пробный период хранится как тариф:

```text
is_trial = true
plan_kind = standalone
price_rub = 0
price_stars = null
```

Ограничение “один trial на пользователя/аккаунт” остаётся в `trial_activations`.

Параметры trial (`duration_days`, `traffic_gb`, `remnawave_squad_uuid`, `traffic_reset_strategy`) берутся из БД-тарифа.

Trial активируется через общий tariff activation flow. Endpoint `/api/subscription/trial` может остаться для обратной совместимости, но внутри он должен находить trial option и вызывать тот же сервис активации, что и обычная покупка. Дублировать отдельную логику активации trial нельзя.

Перед входом в общий activation flow для `is_trial=true` обязательно проверить `trial_activations`:

1. Если trial уже использован текущим пользователем/аккаунтом, активацию заблокировать до создания payment или entitlement.
2. Если trial доступен, создать запись `trial_activations` в той же транзакции, где создаётся trial entitlement.
3. Повторный запрос должен быть идемпотентным и не создавать второй trial.

---

## Автопродление

Автопродление работает как bundle:

1. Standalone имеет `auto_renew_enabled`.
2. Каждый addon имеет собственный `auto_renew_enabled`.
3. Сумма автоплатежа:
   - цена standalone на выбранный период;
   - плюс цены addon, у которых `auto_renew_enabled=true`.
4. После успешной автоплаты:
   - standalone продлевается на свой период;
   - включённые addon продлеваются до нового конца standalone;
   - отключённые addon не продлеваются и будут сняты при истечении.

UI должен позволять пользователю отключить автопродление отдельного addon. Отключение автопродления addon не отключает сам addon до конца уже оплаченного периода.

Чтобы не ломать существующее YooKassa auto-renew, новая реализация не должна удалять legacy auto-renew до готовности bundle-логики. При поэтапном rollout старый auto-renew остаётся для legacy подписок, а новые тарифные entitlements используют bundle renewal сразу после подключения payment activation.

---

## Идемпотентность и ошибки активации

### Повторные webhook'и

Payment providers могут прислать webhook несколько раз. Активация должна быть идемпотентной:

1. Получить `Payment` из БД по `payment_db_id` или provider id.
2. Если `payment.status == succeeded` и `activation_status == succeeded`, вернуть успешный результат без изменения сроков, трафика и entitlements.
3. Если entitlements уже связаны с payment через `entitlement_payments`, не создавать их повторно.
4. Любое продление срока должно происходить только один раз на один payment.

### Remnawave недоступен во время webhook

Если деньги получены, но Remnawave недоступен:

1. Payment помечается как `succeeded`.
2. `activation_status` устанавливается в `pending_panel_sync`.
3. `needs_panel_sync=true`.
4. Локальные entitlements создаются или фиксируются в pending-состоянии так, чтобы повторная попытка не удвоила срок/трафик.
5. Пользователь получает сообщение: оплата получена, подписка активируется, нужно подождать.
6. Background job повторяет sync с Remnawave до успеха.

---

## API проекта

### Публичные endpoint'ы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/subscription/plans` | Список enabled тарифов с options |
| `GET` | `/api/subscription/addons` | Доступные addon для активного standalone |
| `GET` | `/api/subscription/entitlements` | Активный standalone и addon пользователя |
| `PATCH` | `/api/subscription/entitlements/{id}/auto-renew` | Вкл/выкл автопродление entitlement |
| `POST` | `/api/subscription/trial` | Активировать trial-тариф |
| `POST` | `/api/payment/create` | Создать платёж по `plan_option_id` |

`POST /api/payment/create` должен принимать `plan_option_id`. Старый `months` оставить временно как legacy fallback.

### Админские endpoint'ы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/admin/plans` | Список тарифов с options |
| `POST` | `/api/admin/plans` | Создать тариф |
| `PATCH` | `/api/admin/plans/{id}` | Обновить тариф |
| `DELETE` | `/api/admin/plans/{id}` | Удалить тариф |
| `POST` | `/api/admin/plans/{id}/options` | Добавить option |
| `PATCH` | `/api/admin/plans/{id}/options/{option_id}` | Обновить option |
| `DELETE` | `/api/admin/plans/{id}/options/{option_id}` | Удалить option |
| `GET` | `/api/admin/remnawave/squads` | Список Internal Squads из Remnawave |

Все admin endpoints должны использовать существующий `get_current_admin` и rate limit для действий.

---

## Telegram flow

### Пользователь

Новый flow:

```text
Купить
-> выбрать тариф
-> посмотреть описание
-> выбрать option тарифа
-> выбрать способ оплаты
-> оплатить
-> получить ссылку подписки
```

Standalone:

1. Показывать enabled standalone-тарифы.
2. Trial показывать только если пользователь eligible.
3. В тексте показывать `name_{lang}` и `description_{lang}`.
4. После выбора тарифа показывать options.

Addon:

1. Показывать только при активном standalone.
2. Показывать пересчитанную цену до конца подписки.
3. При создании платежа цену пересчитывать повторно на backend/service стороне.

### Администратор

Добавить пункт `Тарифы`.

Экран списка:

```text
Название
Тип: standalone/addon/trial
Remnawave squad: name + uuid
Billing: time/traffic/hybrid
Цены RUB: 250/675/1275/2400
Цены Stars: 100/250/450/800
Статус: enabled/disabled
```

Кнопки:

1. Создать тариф.
2. Редактировать тариф.
3. Удалить тариф, если тарифы есть.
4. Назад.

Создание тарифа:

1. Название RU.
2. Название EN.
3. Описание RU.
4. Описание EN.
5. Выбор Remnawave squad через inline-кнопки из API.
6. Выбор billing model.
7. Выбор kind.
8. Выбор reset strategy.
9. Добавление options.
10. Подтверждение.
11. Сохранение.

Если Remnawave API недоступно на шаге выбора/валидации squad, создание блокируется.

Список Internal Squads кэшируется на 5-10 минут в Redis или локальном short-lived cache, чтобы web admin и bot FSM не делали лишние запросы к Remnawave на каждом шаге.

---

## Web flow

### Пользовательская часть

`SubscriptionPage` должна перейти с выбора периода на выбор тарифа:

1. Список standalone-тарифов.
2. Карточка/панель описания выбранного тарифа.
3. Список options выбранного тарифа.
4. Блок addon при активном standalone.
5. Payment methods после выбора option.
6. После оплаты показать ссылку подключения.

В `My subscription` показывать:

1. Активный standalone.
2. Активные addon.
3. Остаток срока.
4. Трафик: лимит, использовано, остаток.
5. Toggle автопродления standalone.
6. Toggle автопродления addon.

### Админка

`PlansPage.tsx` заменить с простой формы “месяцы + цена” на полноценную форму тарифов:

1. Мультиязычные name/description.
2. Squad picker из Remnawave.
3. Kind: standalone/addon.
4. Trial flag.
5. Billing model.
6. Reset strategy.
7. Options editor.
8. RUB/Stars prices.
9. Enabled/sort order.

---

## Legacy migration и open-source совместимость

### Принципы

1. Старые подписки не изменять автоматически.
2. Старые пользователи продолжают получать доступ по текущим `subscriptions` и Remnawave state.
3. Если в БД нет тарифов, первый запуск новой версии создаёт один legacy standalone-тариф из `.env`.
4. Новые покупки после bootstrap идут через БД-тарифы.
5. `.env` цены и `USER_SQUAD_UUIDS` считаются deprecated.

### Миграция существующей `pricing_plans`

В проекте уже существует таблица `pricing_plans` со старой схемой:

```text
id
duration_months
label
price_rub
price_stars
is_enabled
sort_order
created_at
updated_at
```

Новая схема несовместима со старой, поэтому migration strategy должна быть явной:

1. В Alembic migration переименовать старую таблицу `pricing_plans` в `pricing_plans_legacy`.
2. Создать новую таблицу `pricing_plans` по новой схеме.
3. Создать новую таблицу `pricing_plan_options`.
4. Перенести старые строки из `pricing_plans_legacy` в новый `legacy-default` standalone plan и его options, если новая `pricing_plans` пустая.
5. Если старых строк нет, bootstrap может использовать `.env`.
6. Не удалять `pricing_plans_legacy` в первой версии миграции, чтобы self-hosted пользователи могли откатиться или вручную сверить данные.
7. Старый ORM/DAL/API (`core.dal.pricing_plan_dal`, `web/routers/admin/plans.py`, frontend `PlansPage`) должен быть обновлён в той же фазе, потому что после миграции старая схема больше не соответствует имени `pricing_plans`.
8. Если нужен доступ к legacy table из кода, использовать отдельную модель/алиас `LegacyPricingPlan` с `__tablename__ = "pricing_plans_legacy"`. Если доступ не нужен, не подключать legacy table к ORM.

Запрещено просто добавлять новые NOT NULL колонки в существующую `pricing_plans` без стратегии переноса, потому что это может сломать production-обновление или потерять текущие тарифы.

### Bootstrap

Если `pricing_plans` пустая:

1. Создать `Default` / `Стандартный` standalone plan.
2. `remnawave_squad_uuid` взять из первого значения `USER_SQUAD_UUIDS`.
3. `remnawave_squad_name_snapshot` получить через Remnawave API, если API доступно.
4. Options создать из `RUB_PRICE_1_MONTH`, `RUB_PRICE_3_MONTHS`, `RUB_PRICE_6_MONTHS`, `RUB_PRICE_12_MONTHS` и Stars env-полей.
5. `is_enabled=true`, если есть squad и хотя бы одна цена.

Если Remnawave недоступен при bootstrap:

1. Не блокировать старт приложения.
2. Создать disabled legacy plan или пропустить bootstrap с warning в logs.
3. Админ должен включить/исправить тариф вручную после восстановления Remnawave.

---

## Фазы реализации

### Фаза 1: Модель данных и legacy bootstrap

Цель: подготовить БД без изменения пользовательского flow.

Backend:

1. Alembic migration: переименовать старую `pricing_plans` в `pricing_plans_legacy`.
2. Alembic migration: создать новую `pricing_plans` и `pricing_plan_options`.
3. Alembic migration: создать `user_plan_entitlements` и `entitlement_payments`.
4. Alembic migration: расширить `payments` и `subscriptions`.
5. SQLAlchemy models.
6. DAL для plans, options, entitlements.
7. Перенос старых тарифов из `pricing_plans_legacy` в `legacy-default` plan/options.
8. Bootstrap legacy-тарифа из `.env`, если старых тарифов нет.
9. Тестовая команда/логика проверки bootstrap.

### Фаза 2: Remnawave squads API и валидация

Цель: добавить безопасную работу с Internal Squads.

Backend:

1. Методы `get_internal_squads`, `get_internal_squad`, `validate_internal_squad`.
2. Admin endpoint `/api/admin/remnawave/squads`.
3. Валидация squad при создании/обновлении тарифа.
4. Блокировка сохранения тарифа при недоступном Remnawave.

### Фаза 3: Admin API тарифов

Цель: полноценный CRUD тарифов и options через backend.

Backend:

1. Pydantic schemas.
2. CRUD тарифов.
3. CRUD options.
4. Серверная валидация совместимости `plan_kind`, `billing_model`, `is_trial`, option fields.
5. Серверная валидация `traffic_reset_strategy`.
6. Серверная валидация явного traffic choice для time-only тарифов.
5. Audit log для admin actions.

### Фаза 4: Публичное API тарифов и платежей

Цель: перевести web payment creation на `plan_option_id`.

Backend:

1. Новый response для `/api/subscription/plans`.
2. `/api/subscription/addons`.
3. `/api/subscription/entitlements`.
4. `POST /api/payment/create` по `plan_option_id`.
5. Серверный расчёт addon prorating.
6. Применение минимальной цены prorating.
6. Legacy fallback по `months` оставить временно.

### Фаза 5: Активация тарифов после оплаты

Цель: единый сервис активации для всех payment providers.

Backend/Bot services:

1. `tariff_activation.py`.
2. `tariff_sync.py`.
3. Активация standalone.
4. Активация addon.
5. Активация trial.
6. Суммирование трафика.
7. Обновление `subscriptions`.
8. Идемпотентность повторных webhook.
9. `pending_panel_sync` при ошибке Remnawave после успешной оплаты.
10. Подключение YooKassa, Stars, CryptoPay, FreeKassa, Platega, SeverPay.

### Фаза 6: Telegram user flow

Цель: новый пользовательский flow покупки в боте.

Bot:

1. `Купить -> тариф`.
2. Описание тарифа.
3. `Тариф -> option`.
4. Addon flow.
5. Payment method flow с `plan_option_id`.
6. Сообщение после оплаты с ссылкой подписки.

### Фаза 7: Telegram admin flow

Цель: управление тарифами из бота.

Bot:

1. Пункт `Тарифы` в админке.
2. Список тарифов.
3. Создание тарифа через FSM.
4. Выбор Remnawave squad через API.
5. Включение/выключение тарифа.
6. Удаление тарифа.

### Фаза 8: Web user flow

Цель: адаптировать сайт под выбор тарифов и addon.

Frontend:

1. API types.
2. Tariff selector.
3. Option selector.
4. Addon selector.
5. Payment creation by `plan_option_id`.
6. My subscription с standalone/addon.
7. Auto-renew toggles.

### Фаза 9: Web admin plans page

Цель: заменить текущую простую страницу тарифов.

Frontend:

1. Новая таблица тарифов.
2. Tariff form.
3. Options editor.
4. Remnawave squad picker.
5. Валидация формы.
6. Ошибки Remnawave API.

### Фаза 9.5: Архивные тарифы и единый guard покупки (внеплановая)

Появилась в ходе работы над Фазой 9. Изначально планом не предусматривалась —
изначально планировалось «удаление тарифа с миграцией пользователей», но это
оказалось дорогим и неудобным сценарием для админа. Вместо удаления вводим
статус «архивный»:

- если тариф никем не использовался (ни активно, ни исторически) — его можно
  физически удалить;
- если хотя бы один пользователь его покупал — тариф можно только перевести
  в архив; новые пользователи не увидят его в каталоге;
- активные подписчики архивного тарифа продолжают пользоваться им и могут
  его продлевать (renewal), пока подписка не истечёт;
- после истечения архивный тариф пропадает у бывшего владельца.

Главное архитектурное решение: правило «archived можно купить только как
продление собственной активной standalone-подписки на тот же план»
инкапсулируется единым guard `core/services/plan_purchase_policy.py`,
применяемым во всех точках создания платежа. UI/каталоги не дублируют
проверку, а только используют её.

Backend:

1. Миграция `pricing_plans.is_archived` + индекс.
2. DAL: `archive_plan`, `unarchive_plan`, `has_any_entitlements`; дефолт
   `get_plans(include_archived=False)`; публичные query фильтруют
   `is_archived=False`.
3. Инвариант: `archive` ставит `is_enabled=False`; `unarchive` снимает только
   архив-флаг (включение — отдельным действием), чтобы «убрать из архива»
   и «опубликовать» оставались разными операциями.
4. Bootstrap и legacy DAL не включают архивные планы автоматически.
5. Единый guard `can_purchase_plan_option(session, user_ids, option)`:
   стандартный план — требуется `plan.is_enabled && option.is_enabled`;
   архивный standalone — разрешён только при активном entitlement того же
   `plan_id` у переданных user_ids; архивный addon — никогда.
6. Применение guard:
   - `core/services/payment_core.py` (web payment create);
   - `bot/handlers/user/subscription/payments_subscription.py`
     (`resolve_catalog_offer_for_payment`);
   - `bot/handlers/user/subscription/catalog_flow.py`
     (`select_tariff_callback`, `subscribe_option_callback`).
7. Каталог должен показать архивный план активному владельцу для продления:
   - Web `/api/subscription/plans` — optional auth (нет токена → None;
     просроченный токен → 401 для refresh-flow); подклеивает архивный план
     владельца к каталогу.
   - Bot `display_catalog_tariffs` — то же поведение.
   - Bot `has_catalog_plans(session, user_id)` обязан учитывать архивный
     entitlement пользователя, иначе catalog-роутер уйдёт в legacy flow.
8. `tariff_activation.create_standalone_entitlement` различает renewal
   (`plan_renewed`) и смену плана (`plan_switched`) по `existing.plan_id`.

Admin:

1. Web admin: PATCH plan/option с `is_enabled=true` для архивного →
   409; UI имеет отдельную секцию «Архивные тарифы» с действиями
   Восстановить/Удалить; DELETE использованного тарифа → 409.
2. Bot admin: callback `admin_tariff:enable:{id}` для архивного → alert;
   карточка архивного показывает «Восстановить из архива» вместо
   enable/disable.
3. i18n: 12 ключей в `locales/*.json` (bot) + 11 ключей в
   `frontend/src/i18n.ts` (web). Тексты архивирования упоминают, что
   подписчики могут продлевать; тексты unarchive — что план остаётся
   выключенным.

Что это меняет для следующих фаз:

- **Фаза 10 (Auto-renew bundle).** Автопродление архивного тарифа должно
  работать так же, как обычное (renewal), при условии активного entitlement.
  Bundled-offer для архивного standalone должен включать только те addon,
  что прикреплены к этому архивному standalone. Guard `can_purchase_plan_option`
  должен использоваться и в auto-renew code path при создании платежа.
- **Фаза 11 (Cleanup).** Cleanup job деактивирует истёкший entitlement —
  после этого `can_purchase_plan_option` начнёт отказывать бывшему владельцу.
  Дополнительный шаг: для архивных планов, у которых **не осталось активных
  entitlements**, имеет смысл логировать кандидата на удаление (но не удалять
  автоматически — это явное действие админа).
- **Фаза 12 (Документация).** README и admin docs должны описать различие
  delete vs archive и инвариант unarchive≠enable.

### Фаза 10: Автопродление bundle

Цель: standalone + addon renewal bundle. Эту фазу нельзя выкатывать позднее удаления legacy auto-renew. До завершения bundle-логики старый auto-renew должен оставаться включённым для legacy подписок.

Backend/Bot:

1. Расчёт суммы standalone + auto-renew addon.
2. Bundled-offer при ручном продлении standalone.
3. Snapshot bundle в payment.
4. Продление standalone.
5. Продление включённых addon.
6. Сохранение отключённых addon до старого `ends_at`.
7. UI toggles для addon renewal.

### Фаза 11: Cleanup и синхронизация

Цель: корректно снимать истёкшие addon и поддерживать Remnawave state.

Backend/Bot scheduler:

1. Job для истёкших entitlements.
2. Деактивация addon.
3. Деактивация standalone.
4. Пересборка `activeInternalSquads`.
5. Синхронизация `subscriptions`.
6. Логирование ошибок Remnawave.

### Фаза 12: Документация и полировка

Цель: подготовить open-source обновление.

1. README migration guide.
2. `.env.example` с deprecated-пометками.
3. Admin/user docs.
4. Проверка ru/en i18n.
5. Финальный backend/frontend build.

---

## Главные риски

1. Все payment providers должны активировать тариф по данным `Payment` из БД, а не по callback metadata.
2. Addon prorating нельзя доверять frontend/bot callback.
3. Remnawave имеет один общий `expireAt`, поэтому независимые сроки addon не реализуются.
4. Суммирование трафика должно учитывать текущий лимит из Remnawave, а не только локальную БД, и не должно превращать explicit unlimited в ограниченный лимит.
5. Legacy-пользователей нельзя массово перепривязывать к новым тарифам без явного действия.
6. Автопродление bundle нельзя внедрять с окном, где текущий YooKassa auto-renew уже сломан, а новый ещё не готов.

---

## Рекомендуемый MVP

MVP должен включать:

1. БД-тарифы.
2. Legacy bootstrap.
3. Remnawave squads validation.
4. Standalone purchase.
5. Addon purchase with prorating.
6. Traffic summing.
7. Bot user flow.
8. Web user flow.
9. Web admin CRUD.

После MVP отдельным этапом:

1. Telegram admin CRUD.
2. Trial-as-plan.
3. Auto-renew bundle.
4. Cleanup/sync hardening.
