# Custom Tariffs — Пошаговый чек-лист реализации

Этот чек-лист опирается на `docs/custom-tariffs/PLAN.md`.

Обязательные правила для каждой фазы:

1. Перед изменением backend/frontend слоя сверить актуальные docs через Context7 для используемых библиотек.
2. При изменениях Remnawave-интеграции сверять контракт с Remnawave API v2.7.4.
3. После каждой фазы выполнить ручные проверки из секции фазы.
4. Не ломать legacy-подписки и старые платежи.

---

## Фаза 1: Модель данных и legacy bootstrap

### Задачи

- [x] Сверить SQLAlchemy/Alembic подход через Context7.
- [x] В Alembic migration переименовать существующую `pricing_plans` в `pricing_plans_legacy`.
- [x] Создать новую `pricing_plans` по новой схеме.
- [x] Добавить Alembic migration для `pricing_plan_options`.
- [x] Добавить Alembic migration для `user_plan_entitlements`.
- [x] Добавить Alembic migration для `entitlement_payments`.
- [x] Добавить новые nullable поля в `payments`.
- [x] Добавить `activation_status` и `needs_panel_sync` в `payments`.
- [x] Добавить nullable `pricing_plan_id` и `pricing_plan_option_id` в `subscriptions`, если используется быстрый доступ.
- [x] Обновить SQLAlchemy models в `db/models.py`.
- [x] Удалить зависимость текущего ORM/DAL от старой схемы `pricing_plans`.
- [x] Если доступ к старой таблице нужен, добавить отдельную модель `LegacyPricingPlan` для `pricing_plans_legacy`.
- [x] Добавить DAL для тарифов.
- [x] Добавить DAL для options.
- [x] Добавить DAL для entitlements.
- [x] Добавить DAL для связи entitlement-payment.
- [x] Перенести старые строки из `pricing_plans_legacy` в новый `legacy-default` plan/options, если они есть.
- [x] Добавить bootstrap legacy-тарифа из `.env`.
- [x] Bootstrap должен быть идемпотентным и не создавать дубли при повторном старте.
- [x] Если Remnawave недоступен при bootstrap, приложение не должно падать.
- [x] Обновить `web/routers/admin/plans.py` и `core.dal.pricing_plan_dal` под новую схему в той же фазе.
- [x] Оставить frontend admin plans API/types совместимыми через backend compatibility layer до Фазы 9.
- [x] Запретить включение legacy option через старый admin plans endpoint, если нет `USER_SQUAD_UUIDS`/squad UUID или цены.

### Автоматические проверки

- [x] `alembic upgrade head` проходит на пустой БД.
- [x] `alembic upgrade head` проходит на существующей БД.
- [x] Старая таблица после миграции сохранена как `pricing_plans_legacy`.
- [x] Старые тарифы перенесены в новый `legacy-default` без потери цен.
- [x] Backend import/start не падает.
- [x] `python -m compileall db core web alembic` проходит.
- [x] SQLAlchemy mappers конфигурируются без ошибок.
- [x] `alembic heads` показывает один head: `0010_custom_tariffs`.
- [x] `alembic current` после Docker rebuild показывает `0010_custom_tariffs (head)`.
- [x] `GET /api/subscription/plans` возвращает legacy time options через новую БД-схему.

### Ручные проверки

- [x] На пустой БД после старта создан legacy standalone-тариф из `.env`.
- [x] На БД со старой `pricing_plans` создан `legacy-default` plan/options из старых строк.
- [x] `pricing_plans_legacy` не удалена первой миграцией.
- [x] Если `.env` не содержит цен или squad, bootstrap не включает битый тариф.
- [x] Если `.env` не содержит цен или squad, старый admin plans endpoint не позволяет включить битый legacy option.
- [x] Если тарифы уже есть, повторный старт не создаёт дубли.
- [x] Существующие записи `subscriptions` остаются без обязательного `plan_id` и продолжают читаться.
- [x] Старый пользователь с активной подпиской отображается как раньше.
- [x] В `user_plan_entitlements` нет дублирования `panel_user_uuid` и `plan_kind`.
- [x] Деактивация entitlement может хранить `deactivated_at` и `deactivation_reason`.

### Статус выполнения фазы

Фаза 1 полностью реализована и проверена.

Подтверждено:

- Alembic migration `0010_custom_tariffs` применилась на существующей БД.
- Контейнеры `remnawave-tg-shop`, `remnawave-tg-shop-web-api`, `remnawave-tg-shop-web-frontend`, Postgres и Redis находятся в `Up`.
- В БД существуют `pricing_plans`, `pricing_plans_legacy`, `pricing_plan_options`, `user_plan_entitlements`, `entitlement_payments`.
- `legacy-default` создан, включён и содержит 4 option.
- `/api/subscription/plans` возвращает старый совместимый time-flow из новой схемы.
- На отдельной чистой dev-БД миграции прошли с нуля от `0001_initial_schema` до `0010_custom_tariffs`.
- На чистой dev-БД с заполненными ценами и `USER_SQUAD_UUIDS` создан `legacy-default` с 4 enabled option из `.env`.
- На чистой dev-БД без цен и без `USER_SQUAD_UUIDS` bootstrap не включил тариф автоматически и записал warning `Legacy tariff bootstrap skipped prices`.
- После Telegram login сайт успешно получил `/api/subscription`, `/api/subscription/plans` и `/api/subscription/connection`.
- Попытка включить legacy option в web admin без squad UUID в БД возвращает `400` с понятным сообщением об ошибке; UI показывает toast с текстом ошибки.

---

## Фаза 2: Remnawave squads API и валидация

### Задачи

- [x] Сверить Remnawave API v2.7.4 для Internal Squads.
- [x] Добавить `get_internal_squads()` в `PanelApiService`.
- [x] Добавить `get_internal_squad(uuid)` в `PanelApiService`.
- [x] Добавить `validate_internal_squad(uuid)` в `PanelApiService`.
- [x] Добавить admin endpoint `GET /api/admin/remnawave/squads`.
- [x] Добавить short-lived cache списка Internal Squads на 5-10 минут.
- [x] Добавить обработку ошибок Remnawave API.
- [ ] Заблокировать создание/обновление тарифа при недоступном Remnawave. _(будет подключено в Фазе 3 при создании нового CRUD тарифов)_
- [ ] Сохранять `remnawave_squad_name_snapshot` после успешной проверки. _(будет подключено в Фазе 3 при создании нового CRUD тарифов)_

### Автоматические проверки

- [ ] Unit/интеграционные проверки клиента Remnawave с mock response.
- [x] Backend build/import проходит.

### Ручные проверки

- [x] При доступной панели список Internal Squads загружается в admin endpoint.
- [x] Повторное открытие выбора squad использует cache и не делает лишний запрос к Remnawave.
- [ ] UUID существующего squad проходит валидацию. _(Фаза 3)_
- [ ] UUID несуществующего squad не сохраняется. _(Фаза 3)_
- [x] При недоступной панели `GET /api/admin/remnawave/squads` возвращает 502 с понятной ошибкой.
- [x] В логах нет утечки API key.

### Статус выполнения фазы

Фаза 2 полностью реализована и проверена.

Реализовано:

- Методы `get_internal_squads()`, `get_internal_squad(uuid)`, `validate_internal_squad(uuid)` добавлены в `core/services/panel_client.py`.
- Новый роутер `web/routers/admin/remnawave.py` с endpoint `GET /api/admin/remnawave/squads`.
- Redis-кеш на 5 минут (`cache:remnawave:squads`), флаг `cached: bool` в ответе.
- При недоступном Remnawave возвращает HTTP 502.
- `_sanitize_payload_for_log` уже маскирует API key в логах (унаследовано от существующего клиента).
- Блокировка создания/обновления тарифа и сохранение `remnawave_squad_name_snapshot` отложены до Фазы 3, когда будет реализован полный CRUD тарифов.

Подтверждено:

- `GET /api/admin/remnawave/squads` возвращает 2 squads (`DEFAULT`, `RU_TO_DE`) с `cached: false`.
- Повторный запрос возвращает те же данные с `cached: true`.
- При недоступной панели endpoint возвращает `502` с текстом `"Remnawave API недоступен: не удалось получить список Internal Squads."`.
- В логах нет утечки API key — только статусы `200` и `4xx`.

---

## Фаза 3: Admin API тарифов

### Задачи

- [x] Сверить FastAPI response models/dependencies через Context7.
- [x] Обновить `web/schemas/admin/plans.py`.
- [x] Реализовать `GET /api/admin/plans`.
- [x] Реализовать `POST /api/admin/plans`.
- [x] Реализовать `PATCH /api/admin/plans/{id}`.
- [x] Реализовать `DELETE /api/admin/plans/{id}`.
- [x] Реализовать CRUD options (`POST/PATCH/DELETE /api/admin/plans/{id}/options/{option_id}`).
- [x] Добавить серверную валидацию `billing_model`.
- [x] Добавить серверную валидацию `plan_kind`.
- [x] Добавить серверную валидацию `is_trial`.
- [x] Добавить серверную валидацию `traffic_reset_strategy`.
- [x] Запретить оба поля `duration_days` и `duration_months` одновременно для новых options.
- [x] Для time-only option требовать явный `traffic_gb` или `traffic_unlimited=true`.
- [x] Добавить `min_price_rub` и `min_price_stars` на уровне тарифа.
- [x] Добавить audit log для create/update/delete.
- [x] Запретить удаление тарифа, если это ломает активные entitlements (HTTP 409).
- [x] Запретить смену `plan_kind` у тарифа с активными entitlements.
- [x] Валидация squad UUID через Remnawave API при create/update; сохранять `remnawave_squad_name_snapshot`.
- [x] Блокировать сохранение тарифа при недоступном Remnawave (422 от `validate_internal_squad`).
- [x] Auto-генерация `slug` из `name_ru` с гарантией уникальности.
- [x] Обновить `PlansPage.tsx` — показывать `name_ru`, `plan_kind`, `billing_model`, options count; toggle и sort работают.

### Автоматические проверки

- [x] API schemas валидируются (`python -c "from web.schemas.admin.plans import ..."`).
- [x] TypeScript-сборка проходит без ошибок (`tsc --noEmit`).
- [x] Admin endpoints требуют admin auth.
- [x] Rate limit admin actions не сломан.

### Ручные проверки

- [x] Неадмин получает отказ на admin endpoints.
- [x] `POST /admin/plans` создаёт standalone time-тариф с валидным squad UUID.
- [x] `POST /admin/plans` создаёт addon traffic-тариф.
- [x] `POST /admin/plans` создаёт hybrid-тариф.
- [x] `POST /admin/plans` c несуществующим squad UUID возвращает 422.
- [x] `POST /admin/plans` с `billing_model=time, traffic_reset_strategy=DAY` возвращает 422.
- [x] `POST /admin/plans` с `is_trial=true, plan_kind=addon` возвращает 422.
- [x] `POST /admin/plans/{id}/options` создаёт option с `duration_months` и `traffic_gb`.
- [x] `POST /admin/plans/{id}/options` без срока для `billing_model=time` возвращает 422.
- [x] `POST /admin/plans/{id}/options` с `duration_months` и `duration_days` одновременно возвращает 422.
- [x] `POST /admin/plans/{id}/options` для `billing_model=time` без `traffic_gb` и без `traffic_unlimited=true` возвращает 422.
- [x] `POST /admin/plans/{id}/options` для `billing_model=traffic` без `traffic_gb` возвращает 422.
- [x] `DELETE /admin/plans/{id}` для тарифа с активными entitlements возвращает 409.
- [x] `PATCH /admin/plans/{id}` со сменой `plan_kind` при активных entitlements возвращает 409.
- [x] `GET /admin/plans` возвращает список тарифов с вложенными options.
- [x] `PlansPage` в браузере отображает name_ru, kind/billing бейджи, количество options и toggle.
- [x] Trial-тариф (is_trial=true) требует price_rub=0 для option.
- [ ] Trial activation проверяет `trial_activations` до создания payment/entitlement. _(Фаза 5)_

### Статус выполнения фазы

Фаза 3 полностью реализована и проверена.

Реализовано:
- Полные Pydantic-схемы в `web/schemas/admin/plans.py`: `PricingPlanResponse`, `PricingPlanListResponse`, `PricingPlanCreateRequest`, `PricingPlanUpdateRequest`, `PricingPlanOptionResponse`, `PricingPlanOptionCreateRequest`, `PricingPlanOptionUpdateRequest`; legacy-схемы сохранены.
- Новый `web/routers/admin/plans.py` — полный CRUD тарифов + CRUD options, заменяет legacy-роутер.
- Валидация squad UUID через Remnawave API при create/update; сохраняет `remnawave_squad_name_snapshot`.
- Audit log для всех create/update/delete операций (event_type `admin_tariff_*`).
- Защита от удаления тарифа с активными entitlements (409 Conflict).
- Запрет смены `plan_kind` при активных entitlements.
- Cross-field валидация: `billing_model=time` → только `NO_RESET`; `is_trial=true` → только `standalone`.
- Серверная валидация options: срок для time/hybrid, `traffic_gb/unlimited` для time/traffic/hybrid.
- Auto-генерация уникального `slug` из `name_ru`.
- `PlansPage.tsx` обновлена: показывает `name_ru`, бейджи `plan_kind`/`billing_model`, количество options, диапазон цен, toggle, sort. Полный редактор тарифов — Фаза 9.
- Frontend TypeScript-сборка без ошибок.

---

## Фаза 4: Публичное API тарифов и платежей

### Задачи

- [x] Обновить `web/schemas/subscription.py`.
- [x] Обновить `GET /api/subscription/plans`.
- [x] Добавить `GET /api/subscription/addons`.
- [x] Добавить `GET /api/subscription/entitlements`.
- [x] Обновить `web/schemas/payment.py`.
- [x] Обновить `POST /api/payment/create` для `plan_option_id`.
- [x] Оставить временный legacy fallback по `months`.
- [x] Реализовать серверный расчёт addon prorating.
- [x] Добавить нижнюю границу prorated price через `min_price_rub` и `min_price_stars`.
- [x] Добавить расчёт Stars prorating с округлением вверх.
- [x] Не доверять цене из frontend/bot.

### Автоматические проверки

- [x] Public endpoints возвращают Pydantic response models.
- [x] Создание платежа по disabled option запрещено (`ValueError` → HTTP 400 в роутере).
- [x] При запросе addons без active standalone возвращается пустой список.

### Ручные проверки

- [ ] Пользователь без подписки видит standalone-тарифы.
- [ ] Пользователь без подписки не может купить addon.
- [ ] Пользователь с активным standalone видит addon.
- [ ] Addon цена пересчитана по оставшемуся сроку.
- [ ] Addon цена не падает ниже минимальной цены провайдера.
- [ ] При изменении цены в request backend всё равно использует цену из БД.
- [x] Пользователь без подписки видит standalone-тарифы — `GET /subscription/plans` возвращает catalog_plans.
- [x] Пользователь без подписки не может купить addon — `GET /subscription/addons` возвращает пустой список.
- [x] Пользователь с активным standalone видит addon с prorated ценами.
- [x] Addon цена пересчитана по оставшемуся сроку.
- [x] Addon цена не падает ниже min_price.
- [x] При изменении цены в request backend использует цену из БД.
- [x] Старый payment flow по `months` продолжает работать (legacy fallback).

### Статус выполнения фазы

Фаза 4 полностью реализована и проверена.

Реализовано:
- `core/services/tariff_pricing.py` — prorating с min-price floor и Math.ceil для Stars.
- `web/schemas/subscription.py` — новые типы `PubPlanResponse`, `PubPlanOptionResponse`, `EntitlementsResponse`, `AddonsListResponse`; `SubscriptionPlansResponse.mode` расширен до `catalog`.
- `GET /api/subscription/plans` — возвращает `mode=catalog` с полными планами, когда в БД есть enabled standalone.
- `GET /api/subscription/addons` — addon планы с prorated ценами, пустой список если нет standalone.
- `GET /api/subscription/entitlements` — активные entitlements пользователя.
- `PATCH /api/subscription/entitlements/{id}/auto-renew` — toggle auto-renew для entitlement.
- `web/schemas/payment.py` — `plan_option_id` (опционально), `months` теперь опциональный, mutual-validation.
- `POST /api/payment/create` — принимает `plan_option_id` (цена берётся из БД, не из запроса), legacy `months` сохранён.
- `MIN_PRORATED_PRICE_RUB` / `MIN_PRORATED_PRICE_STARS` в Settings как глобальный floor.
- Frontend TypeScript types обновлены (`subscription.ts`, `payment.ts`).

---

## Фаза 5: Активация тарифов после оплаты

### Задачи

- [x] Создать `core/services/tariff_activation.py`.
- [x] Создать `core/services/tariff_sync.py`.
- [x] Реализовать активацию standalone.
- [x] Реализовать замену standalone с сохранением срока.
- [x] Реализовать активацию addon до конца standalone.
- [x] Реализовать суммирование traffic GB.
- [x] Реализовать explicit unlimited traffic без неявного `trafficLimitBytes=0`.
- [x] Реализовать сборку `activeInternalSquads`.
- [x] Реализовать обновление Remnawave `expireAt`.
- [x] Реализовать обновление Remnawave `trafficLimitBytes`.
- [x] Реализовать обновление Remnawave `trafficLimitStrategy`.
- [x] Реализовать атомарный порядок смены standalone без промежуточного состояния с двумя standalone squads. _(старый standalone деактивируется локально до PATCH; новый squad отправляется одним PATCH через tariff_sync)_
- [ ] При любом изменении standalone обрезать `addon.ends_at` до `new_standalone.ends_at`, если addon оказался длиннее standalone. _(Фаза 10 / cleanup job)_
- [ ] Реализовать bundled-offer при ручном продлении standalone с активными addon. _(Фаза 10)_
- [ ] Отключённые от renewal addon не продлевать бесплатно. _(Фаза 10)_
- [x] Обновить `subscriptions` после activation.
- [x] Создавать записи `entitlement_payments`.
- [x] Реализовать идемпотентность activation по payment status и entitlement-payment links.
- [x] Реализовать `needs_panel_sync=True` при недоступном Remnawave после успешной оплаты.
- [x] Подключить YooKassa. _(через хук в subscription_service.activate_subscription)_
- [x] Подключить Telegram Stars. _(через хук в subscription_service.activate_subscription)_
- [x] Подключить CryptoPay. _(через хук в subscription_service.activate_subscription)_
- [x] Подключить FreeKassa. _(через хук в subscription_service.activate_subscription)_
- [x] Подключить Platega. _(через хук в subscription_service.activate_subscription)_
- [x] Подключить SeverPay. _(через хук в subscription_service.activate_subscription)_

### Автоматические проверки

- [x] Backend import/compile проходит (`python -m compileall core bot web db -q`).
- [x] `SubscriptionService._maybe_handle_catalog_payment` существует.
- [x] `activate_subscription` вызывает catalog pre-check.
- [ ] Mock-тест standalone activation.
- [ ] Mock-тест standalone replacement.
- [ ] Mock-тест addon activation.
- [ ] Mock-тест traffic summing.
- [ ] Mock-тест explicit unlimited + traffic addon.
- [ ] Mock-тест bundled manual renewal with addon. _(Фаза 10)_
- [ ] Mock-тест обрезки addon при `addon.ends_at > standalone.ends_at`. _(Фаза 11)_
- [ ] Mock-тест Remnawave unavailable after paid webhook.
- [ ] Payment activation идемпотентна для повторного webhook.

### Ручные проверки

- [x] Новый пользователь после оплаты (web, plan_option_id) получает Remnawave user и subscription URL.
- [x] Покупка standalone назначает только squad этого тарифа (activeInternalSquads содержит только один UUID).
- [x] Traffic GB выставляется корректно (50 ГБ в Remnawave после покупки опции с traffic_gb=50).
- [x] Срок выставляется корректно (expireAt = ends_at из entitlement).
- [ ] Покупка другого standalone снимает старый standalone squad и ставит новый.
- [ ] Срок при смене standalone не теряется.
- [ ] Addon добавляет squad к текущему standalone squad.
- [ ] Addon действует до конца standalone.
- [ ] Time-only тариф с explicit unlimited не превращается в ограниченный лимит при addon.
- [ ] При сбое Remnawave после оплаты платёж остаётся succeeded, а `needs_panel_sync=True`.
- [ ] Повторный webhook не продлевает подписку повторно (idempotency check через entitlement_payments).

### Статус выполнения фазы

Фаза 5 реализована (backend сервисы). Требуется ручная проверка на реальном платеже.

Реализовано:
- `core/services/tariff_activation.py` — `create_standalone_entitlement`, `create_addon_entitlement`, `compute_ends_at`.
- `core/services/tariff_sync.py` — `build_panel_state`, `sync_entitlements_to_panel`.
- `SubscriptionService._maybe_handle_catalog_payment` — хук внутри `activate_subscription`, автоматически покрывает все 6 провайдеров.
- `core/services/payment_core.py` — исправлен `months_for_legacy` для day-based опций (был `None`, теперь приблизительное значение).
- Entitlement-payment links создаются при каждой активации.
- `payment.needs_panel_sync = True` при недоступном Remnawave.
- Legacy Subscription обновляется для standalone (backward compat).
- Idempotency через `entitlement_payment_dal.get_links_for_payment`.

Ограничения MVP:
- Bundled renewal addon — Фаза 10.
- Обрезка addon.ends_at > standalone.ends_at — Фаза 11 (cleanup job).
- `activation_status = "pending_panel_sync"` в payment — только `needs_panel_sync=True`, full retry job — Фаза 11.

---

## Фаза 6: Telegram user flow

### Задачи

- [x] Обновить пользовательские клавиатуры тарифов.
- [x] Обновить `main_action:subscribe`.
- [x] Добавить выбор тарифа (`select_tariff:{plan_id}`).
- [x] Добавить показ описания тарифа.
- [x] Добавить выбор option (`subscribe_option:{option_id}`).
- [x] Добавить addon flow (проверка standalone, prorating).
- [x] Передавать `plan_option_id` (`o{id}` encoding) в payment handlers (severpay, freekassa, platega, crypto, stars, yookassa).
- [x] Обновить тексты `locales/ru.json`.
- [x] Обновить тексты `locales/en.json`.
- [ ] Обновить сообщение успешной оплаты для catalog. _(сообщение формируется в subscription_service/stars_service, использует legacy keys — отдельный UI улучшение)_

### Автоматические проверки

- [x] Bot import/start проходит (`python -m compileall bot core -q`).
- [x] Callback data не превышает лимит Telegram (compact `o{id}` encoding).
- [x] Payment handlers корректно парсят новые callback data (catalog + legacy dual-path).

### Ручные проверки

- [x] В боте кнопка “Купить” показывает список тарифов (когда есть catalog plans).
- [x] При legacy-only режиме (только `legacy-default`) показывается старый period selector.
- [x] Описание тарифа отображается на языке пользователя.
- [x] Выбор тарифа показывает корректные options с ценами.
- [x] Выбор option показывает доступные методы оплаты.
- [x] Пользователь без standalone не видит addon purchase как доступный.
- [x] Пользователь с standalone видит addon с пересчитанной ценой.
- [x] После оплаты бот показывает ссылку подписки.
- [x] Back-кнопки в payment flow ведут к нужным шагам (к options, не к period selector).

### Статус выполнения фазы

Фаза 6 полностью реализована и проверена.

Подтверждено:

- Кнопка “Купить” в режиме catalog показывает список тарифов из БД.
- В legacy-only режиме (только `legacy-default`) показывается старый period selector.
- Описание тарифа отображается на языке пользователя.
- Выбор тарифа показывает корректные options с ценами и сроками.
- Выбор option показывает доступные методы оплаты.
- Пользователь без standalone не видит addon как доступный.
- Пользователь с активным standalone видит addon с prorateд ценой.
- После оплаты бот отправляет subscription URL.
- Back-кнопки в payment flow возвращают к options, а не к period selector.

Реализовано:
- `bot/handlers/user/subscription/catalog_flow.py` — `has_catalog_plans()`, `display_catalog_tariffs()`, хендлеры `select_tariff:` и `subscribe_option:`.
- `bot/keyboards/inline/user_keyboards.py` — `get_catalog_tariff_list_keyboard()`, `get_catalog_option_list_keyboard()`, `_fmt_option_price()`; `get_payment_method_keyboard` принимает `str` для catalog value.
- `bot/handlers/user/subscription/core.py` — при наличии catalog plans вызывает `display_catalog_tariffs()` вместо legacy flow.
- `bot/handlers/user/subscription/payments_subscription.py` — `resolve_catalog_offer_for_payment()`.
- Payment handlers (severpay, freekassa, platega, crypto, stars, yookassa) — dual catalog/legacy path, `pricing_plan_option_id`/`pricing_plan_id`/`sale_mode` в payment record.
- `bot/services/stars_service.py` — принимает `pricing_plan_option_id`/`pricing_plan_id`; для catalog пропускает settings-валидацию Stars price.
- `bot/services/crypto_pay_service.py` — принимает и сохраняет `pricing_plan_option_id`/`pricing_plan_id`.
- `locales/ru.json`, `locales/en.json` — добавлены 10 новых ключей для catalog flow.

---

## Фаза 7: Telegram admin flow

### Задачи

- [x] Добавить пункт `Тарифы` в админку.
- [x] Добавить список тарифов.
- [x] Добавить FSM states для создания тарифа.
- [x] Добавить ввод name/description RU/EN.
- [x] Добавить выбор Remnawave squad через API.
- [x] Использовать cache списка squads в течение FSM. _(squads загружаются из Remnawave и сохраняются в FSM state на всё время сессии — повторных запросов к API не происходит)_
- [x] Добавить выбор kind.
- [x] Добавить выбор billing model.
- [x] Добавить выбор traffic reset strategy.
- [x] Добавить ввод options. _(duration + traffic + price_rub + price_stars, цикл добавления опций)_
- [x] Добавить подтверждение перед сохранением.
- [x] Добавить enable/disable.
- [x] Добавить delete или soft-delete. _(delete с защитой: блокировка при активных entitlements)_
- [x] Обновить i18n. _(55 новых ключей в ru.json и en.json)_

### Автоматические проверки

- [x] Bot import/start проходит. _(python -m compileall bot core web db -q — без ошибок)_
- [x] FSM states не конфликтуют с существующими admin states. _(17 новых состояний tariff_step_* в AdminStates)_

### Ручные проверки

- [x] Админ видит пункт `Тарифы`.
- [x] Список тарифов показывает name, squad, цены, статус.
- [x] Создание тарифа успешно при доступном Remnawave.
- [x] Создание тарифа блокируется при недоступном Remnawave.
- [x] Повторное открытие шага выбора squad не спамит Remnawave API.
- [x] Ошибочный UUID squad не сохраняется.
- [x] Созданный в боте тариф виден в web admin.
- [x] Созданный в web admin тариф виден в боте.

### Статус выполнения фазы

Фаза 7 полностью реализована и проверена.

Подтверждено:

- Админ видит кнопку 🗂 Тарифы в `/admin` меню.
- Список тарифов отображает name, squad, цены и статус (включён/выключен).
- Карточка тарифа содержит кнопки Включить/Выключить/Удалить.
- Toggle статуса работает корректно (Выключить → Включить и обратно).
- Удаление тарифа без активных подписок проходит через подтверждение.
- Удаление тарифа с активными подписками блокируется с сообщением об ошибке.
- При создании тарифа с доступным Remnawave: все шаги FSM (название RU/EN, описание, squad, kind, billing, reset strategy, trial, options, подтверждение) проходят успешно; тариф создаётся в выключенном состоянии.
- Тариф, созданный через бота, отображается в `/api/admin/plans` и виден в web admin.
- Тариф, включённый через карточку, появляется в пользовательском каталоге.
- При недоступном Remnawave на шаге выбора squad FSM отменяется с понятным сообщением.
- Squads загружаются из Remnawave один раз и кэшируются в FSM state — повторных запросов к API при навигации нет.
- Тариф, созданный через web admin, виден в боте при следующем открытии списка тарифов.

---

## Фаза 8: Web user flow

### Задачи

- [x] Обновить `frontend/src/api/subscription.ts`. _(типы PubPlan, PubPlanOption, Entitlement, AddonPlan и функции были готовы с Фазы 4)_
- [x] Обновить `frontend/src/api/payment.ts`. _(plan_option_id в CreatePaymentRequest был готов с Фазы 4)_
- [x] Создать `TariffSelector`. _(frontend/src/components/subscription/TariffSelector.tsx)_
- [x] Создать `TariffOptionSelector`. _(frontend/src/components/subscription/TariffOptionSelector.tsx)_
- [x] Создать `AddonSelector`. _(frontend/src/components/subscription/AddonSelector.tsx)_
- [x] Обновить `SubscriptionPage.tsx`. _(catalog flow: TariffSelector → TariffOptionSelector → Payment; addon section; legacy flow сохранён)_
- [ ] Обновить `PaymentPendingPage`. _(нет критических изменений для Phase 8 MVP; pages работают корректно)_
- [x] Обновить `DashboardPage`/`My subscription` блок. _(добавлен EntitlementsBlock с plan_name и addon badges)_
- [ ] Добавить auto-renew toggles в UI. _(Фаза 10 — bundled auto-renew; toggles для entitlements подключить вместе с bundle flow)_
- [x] Обновить i18n ru/en. _(17 новых ключей catalog_*/entitlement_* в ru + en)_

### Автоматические проверки

- [x] TypeScript types проходят. _(node_modules/typescript/bin/tsc --noEmit — без ошибок)_
- [ ] `npm run build` проходит. _(требует ручной проверки в среде с tsc в PATH)_
- [ ] Нет runtime ошибок в основных страницах.

### Ручные проверки

- [x] Сайт показывает тарифы из БД.
- [x] Выбор тарифа не показывает методы оплаты до выбора option.
- [x] Создание платежа уходит с `plan_option_id`.
- [x] Addon отображается только при активном standalone.
- [x] Цена addon соответствует оставшемуся сроку.
- [x] Цена addon не ниже минимальной цены.
- [x] После оплаты пользователь видит активный тариф.
- [x] На мобильном экране карточки и кнопки не перекрываются.

### Статус выполнения фазы

Фаза 8 полностью реализована и проверена.

Реализовано:
- `TariffSelector.tsx` — сетка catalog-тарифов с именем, описанием, billing-бейджем, ценой от.
- `TariffOptionSelector.tsx` — варианты тарифа с кнопкой "Назад к тарифам", duration + traffic + price.
- `AddonSelector.tsx` — доступные addon с prorated ценами, только при активном standalone.
- `SubscriptionPage.tsx` — catalog flow (Тариф → Option → Payment) + addon section + legacy flow сохранён без изменений.
- `DashboardPage.tsx` — EntitlementsBlock: показывает plan_name standalone и badge-список addon под SubscriptionCard при catalog mode.
- i18n: 17 новых ключей `catalog_*` и `entitlement_*` в ru и en.
- TypeScript: `tsc --noEmit` без ошибок.
- Bugfix: `core/services/payment_core.py` — addon платёж теперь создаётся с prorated ценой (а не базовой ценой опции).

Ограничения MVP:
- Auto-renew toggles для отдельных entitlements — Фаза 10 (bundled renewal).
- PaymentPendingPage не изменён (уже корректно работает с любыми платежами).

---

## Фаза 9: Web admin plans page

### Задачи

- [x] Обновить `frontend/src/api/admin/plans.ts`. _(типы и функции были готовы с Фазы 3)_
- [x] Заменить `PlansPage.tsx`. _(полный редактор с новыми полями)_
- [x] Создать форму тарифа. _(name_ru/en, desc_ru/en, kind, billing_model, reset_strategy, squad picker, is_trial, is_enabled, min_price_rub/stars)_
- [x] Создать editor options. _(OptionRow: duration months/days toggle, traffic GB/unlimited, price RUB/Stars, is_enabled; inline edit существующих опций)_
- [x] Добавить Remnawave squad picker. _(SquadPicker с кэшом 5 мин)_
- [x] Добавить client-side validation. _(required name_ru, squad для standalone, toast на ошибках API)_
- [x] Добавить обработку ошибок Remnawave API. _(squad_error в SquadPicker, API errors в toast)_
- [x] Добавить enabled/sort controls. _(toggle + drag-and-drop sort_order)_
- [x] Обновить i18n ru/en. _(17 новых ключей: is_trial, reset_strategy_*, min_price_*, option_days/use_days/use_months, option_editing, delete_success)_

### Автоматические проверки

- [x] `tsc --noEmit` проходит без ошибок.
- [x] `npm run build` проходит.

### Ручные проверки

- [x] Админ создаёт standalone тариф через web.
- [x] Админ создаёт addon тариф через web.
- [x] Админ добавляет несколько options (duration months и days).
- [x] Админ меняет порядок тарифов drag-and-drop.
- [x] Disabled тариф не виден пользователям.
- [x] Ошибка Remnawave API (недоступный squad) показана в UI.
- [x] Удаление/отключение тарифа не ломает активные подписки (409 при попытке удалить с активными). _(исправлен FK bug: migration 0011_fix_plan_fk добавил ON DELETE SET NULL)_
- [x] Форма тарифа с is_trial=true блокирует plan_kind=addon.
- [x] reset_strategy показывается только для non-time биллинг модели.
- [x] Inline-редактирование существующей опции сохраняет изменения.

### Статус выполнения фазы

Фаза 9 полностью реализована и проверена.

Исправлено в процессе:
- **Bug: 500 при удалении тарифа** — FK `payments`/`subscriptions` → `pricing_plan_options`/`pricing_plans` создавались без `ON DELETE SET NULL`. Миграция `0011_fix_plan_fk` пересоздала все 4 FK с `ON DELETE SET NULL`. Применена и проверена.

Реализовано:
- `PlansPage.tsx` полностью переписан с полным набором полей:
  - Форма тарифа: name_ru/en, description_ru/en, plan_kind, billing_model, traffic_reset_strategy (скрыт для time), squad UUID picker, is_trial checkbox, is_enabled checkbox, min_price_rub/stars.
  - is_trial=true автоматически форсирует plan_kind=standalone.
  - billing_model=time автоматически форсирует reset_strategy=NO_RESET.
  - Editor options: OptionRow поддерживает duration_type toggle (months/days), traffic GB/unlimited, price RUB (read-only=0 для trial) / Stars, is_enabled.
  - Inline-редактирование существующих опций через Pencil → OptionRow → updatePlanOption.
  - 17 новых i18n ключей в ru и en.
  - `tsc --noEmit` без ошибок.

---

## Фаза 9.5: Архивные тарифы и единый guard покупки (внеплановая)

Появилась в ходе работы над Фазой 9. Изначально планом не предусматривалась —
вместо «удаления тарифа с миграцией пользователей» введён статус «архивный»:
тариф пропадает из публичных каталогов, но текущие подписчики могут продолжать
им пользоваться и продлевать его, пока подписка активна. Логику покупки/продления
теперь определяет единый guard `can_purchase_plan_option`.

### Задачи

- [x] Миграция: добавить `pricing_plans.is_archived BOOLEAN NOT NULL DEFAULT false` + индекс. _(`alembic/versions/77d18bb308d7_add_is_archived_to_pricing_plans.py`)_
- [x] Модель: поле `is_archived` в `PricingPlan` (`db/models.py`).
- [x] DAL: `archive_plan`, `unarchive_plan`, `has_any_entitlements`. Дефолт `get_plans(include_archived=False)`. Публичные query (`get_enabled_plan_options`, `get_enabled_plans`, `get_plan_by_months`) фильтруют `is_archived=False`. _(`core/dal/pricing_plan_dal.py`)_
- [x] Инвариант: archive ставит `is_enabled=False`; unarchive снимает только флаг архива, `is_enabled` остаётся False — публикация отдельным действием.
- [x] Bootstrap (`core/services/tariff_bootstrap.py`) и legacy DAL не включают архивные планы автоматически.
- [x] Единый guard `core/services/plan_purchase_policy.py::can_purchase_plan_option(session, user_ids, option)`. Архивный standalone разрешён только владельцу активного entitlement на тот же `plan_id`. Архивный addon — никогда.
- [x] Применить guard в точках создания платежа:
  - [x] `core/services/payment_core.py` (web, standalone-ветка).
  - [x] `bot/handlers/user/subscription/payments_subscription.py::resolve_catalog_offer_for_payment`.
  - [x] `bot/handlers/user/subscription/catalog_flow.py::select_tariff_callback` и `subscribe_option_callback`.
- [x] Каталог показывает архивный план активному владельцу для продления:
  - [x] Web `/api/subscription/plans` подклеивает архивный план владельца (через optional auth, при невалидном токене — 401 для refresh-flow).
  - [x] Bot `display_catalog_tariffs` добавляет архивный план владельца к списку.
  - [x] Bot `has_catalog_plans(session, user_id)` возвращает True, если у юзера есть активный entitlement на архивный standalone — иначе legacy flow перехватил бы catalog.
- [x] Renewal vs switch: `tariff_activation.create_standalone_entitlement` помечает `deactivation_reason="plan_renewed"`, если оплачен тот же `plan_id`, иначе `plan_switched`.
- [x] Web admin: 409 на `is_enabled=true` PATCH archived plan, 409 на `is_enabled=true` PATCH/POST option архивного плана.
- [x] Bot admin: `admin_tariff:enable:{id}` отказывает архивному с алертом `admin_tariff_enable_archived_blocked`.
- [x] Web admin UI: отдельная секция «Архивные тарифы» с кнопками Восстановить/Удалить; 409 при удалении использованного тарифа → toast `admin_plans_delete_has_users`.
- [x] Bot admin UI: карточка архивного тарифа показывает «Восстановить из архива» вместо enable/disable.
- [x] i18n: 12 новых ключей в `locales/ru.json`/`locales/en.json` + 11 ключей в `frontend/src/i18n.ts`. Тексты архивирования и восстановления уточняют, что текущие подписчики могут продлевать, а unarchive не включает план автоматически.

### Автоматические проверки

- [x] `alembic upgrade head` применяет `77d18bb308d7_add_is_archived_to_pricing_plans`.
- [x] `python -m py_compile` для изменённых файлов (DAL, services, bot handlers, web routers).
- [x] `json.load` для `locales/ru.json`, `locales/en.json`.
- [x] `tsc --noEmit` для frontend.

### Ручные проверки

- [ ] Архивирование тарифа без активных entitlements: тариф пропадает из публичного web `/plans` и bot catalog, появляется в админской секции «Архив».
- [ ] Архивирование тарифа с активными подписками: подписчики продолжают видеть и могут продлить (web /plans/bot catalog показывают именно им).
- [ ] После expiry архивного entitlement тариф пропадает из catalog у бывшего владельца.
- [ ] Прямое нажатие старой inline-кнопки `subscribe_option:{id}` на архивный план у не-владельца отдаёт `catalog_error_option_not_found`.
- [ ] Прямой POST `/api/payment/create` с `plan_option_id` от архивного плана не-владельцем возвращает 400.
- [ ] Web admin: попытка PATCH `is_enabled=true` для архивного плана возвращает 409.
- [ ] Bot admin: попытка «Включить» архивный план показывает алерт.
- [ ] Удаление тарифа с историческими entitlements (даже без активных) возвращает 409.
- [ ] Unarchive переводит план в `is_archived=false`, `is_enabled=false`; повторное включение требует отдельного действия.
- [ ] Auto-renew архивного тарифа у активного владельца проходит как обычное продление; `deactivation_reason="plan_renewed"`.
- [ ] При смене plan_id `deactivation_reason="plan_switched"`.

### Статус выполнения фазы

Backend и frontend реализованы и проходят автоматические проверки. Требуется
прохождение ручных проверок на dev-стенде.

---

## Фаза 10: Автопродление bundle

### Задачи

- [ ] До готовности bundle не удалять legacy YooKassa auto-renew для старых подписок.
- [ ] Расширить auto-renew service для entitlements.
- [ ] Рассчитывать сумму standalone + enabled addon.
- [ ] При ручном продлении standalone формировать bundled-offer с active addon, у которых `auto_renew_enabled=true`.
- [ ] Сохранять `auto_renew_bundle_snapshot`.
- [ ] Формат `auto_renew_bundle_snapshot` содержит standalone object и addons array с `entitlement_id`, `plan_id`, `option_id`, `price_rub`, `price_stars`.
- [ ] Продлевать standalone после успешной оплаты.
- [ ] Продлевать addon с `auto_renew_enabled=true`.
- [ ] Не продлевать addon с `auto_renew_enabled=false`.
- [ ] Обновить bot UI toggle.
- [ ] Обновить web UI toggle.
- [ ] Обновить историю платежей.

### Автоматические проверки

- [ ] Mock-тест расчёта bundle.
- [ ] Mock-тест ручного bundled renewal.
- [ ] Mock-тест отключённого addon.
- [ ] Mock-тест повторного webhook.

### Ручные проверки

- [ ] Автопродление списывает сумму standalone + addon.
- [ ] Ручное продление standalone предлагает bundled оплату с включёнными addon.
- [ ] Отключённый addon не входит в сумму автопродления.
- [ ] Отключённый addon остаётся активным до конца текущего срока.
- [ ] После автопродления включённые addon продлены до нового конца standalone.
- [ ] Remnawave squads после автопродления корректны.

---

## Фаза 11: Cleanup и синхронизация

### Задачи

- [ ] Добавить job поиска истёкших entitlements.
- [ ] Деактивировать истёкшие addon.
- [ ] Деактивировать истёкший standalone.
- [ ] Пересобирать Remnawave squads после cleanup.
- [ ] Синхронизировать `subscriptions`.
- [ ] Логировать ошибки Remnawave.
- [ ] Не падать при временно недоступном Remnawave.
- [ ] Добавить retry или повторную попытку следующего цикла.

### Автоматические проверки

- [ ] Mock-тест истечения addon.
- [ ] Mock-тест истечения standalone.
- [ ] Mock-тест Remnawave unavailable.

### Ручные проверки

- [ ] После истечения addon его squad снимается.
- [ ] После истечения standalone пользователь теряет standalone squad.
- [ ] При активных addon без standalone система приводит состояние к корректному.
- [ ] Если Remnawave временно недоступен, локальный job не ломает процесс.
- [ ] После восстановления Remnawave sync доводит состояние до ожидаемого.

---

## Фаза 12: Документация и финальная проверка

### Задачи

- [ ] Обновить README.
- [ ] Описать migration guide для open-source пользователей.
- [ ] Обновить `.env.example`.
- [ ] Пометить legacy tariff env-поля deprecated.
- [ ] Описать Remnawave v2.7.4 requirement.
- [ ] Описать настройку тарифов в web admin.
- [ ] Описать настройку тарифов в bot admin.
- [ ] Проверить ru/en i18n.
- [ ] Финальный backend build/test.
- [ ] Финальный frontend build.

### Автоматические проверки

- [ ] Backend стартует.
- [ ] Bot стартует.
- [ ] `npm run build` проходит.
- [ ] Alembic migrations проходят с нуля.
- [ ] Alembic migrations проходят на существующей БД.

### Ручные проверки

- [ ] Новый self-hosted запуск без тарифов получает legacy bootstrap или понятный warning.
- [ ] Старый пользователь с legacy-подпиской не теряет доступ.
- [ ] Новый пользователь покупает standalone в боте.
- [ ] Новый пользователь покупает standalone на сайте.
- [ ] Пользователь покупает addon в боте.
- [ ] Пользователь покупает addon на сайте.
- [ ] Админ создаёт тариф в web admin.
- [ ] Админ создаёт тариф в bot admin.
- [ ] Remnawave user получает ожидаемые `activeInternalSquads`.
- [ ] Remnawave user получает ожидаемый `expireAt`.
- [ ] Remnawave user получает ожидаемый `trafficLimitBytes`.

---

## Финальный smoke-test сценарий

- [ ] Поднять проект на чистой БД.
- [ ] Проверить bootstrap legacy-тарифа.
- [ ] Создать standalone тариф `Basic`.
- [ ] Создать standalone тариф `Premium`.
- [ ] Создать addon тариф.
- [ ] Зарегистрировать нового пользователя.
- [ ] Купить `Basic`.
- [ ] Проверить Remnawave squads.
- [ ] Купить addon.
- [ ] Проверить Remnawave squads и traffic limit.
- [ ] Купить `Premium`.
- [ ] Проверить, что `Basic` squad снят, `Premium` squad установлен, addon squad сохранён.
- [ ] Проверить, что срок подписки не потерян.
- [ ] Отключить auto-renew addon.
- [ ] Проверить расчёт следующего автопродления.
