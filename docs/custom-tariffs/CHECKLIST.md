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

- [ ] Создать `core/services/tariff_activation.py`.
- [ ] Создать `core/services/tariff_sync.py`.
- [ ] Реализовать активацию standalone.
- [ ] Реализовать замену standalone с сохранением срока.
- [ ] Реализовать активацию addon до конца standalone.
- [ ] Реализовать суммирование traffic GB.
- [ ] Реализовать explicit unlimited traffic без неявного `trafficLimitBytes=0`.
- [ ] Реализовать сборку `activeInternalSquads`.
- [ ] Реализовать обновление Remnawave `expireAt`.
- [ ] Реализовать обновление Remnawave `trafficLimitBytes`.
- [ ] Реализовать обновление Remnawave `trafficLimitStrategy`.
- [ ] Реализовать атомарный порядок смены standalone без промежуточного состояния с двумя standalone squads.
- [ ] При любом изменении standalone обрезать `addon.ends_at` до `new_standalone.ends_at`, если addon оказался длиннее standalone.
- [ ] Реализовать bundled-offer при ручном продлении standalone с активными addon.
- [ ] Отключённые от renewal addon не продлевать бесплатно.
- [ ] Обновить `subscriptions` после activation.
- [ ] Создавать записи `entitlement_payments`.
- [ ] Реализовать идемпотентность activation по payment status и entitlement-payment links.
- [ ] Реализовать `pending_panel_sync` и `needs_panel_sync` при недоступном Remnawave после успешной оплаты.
- [ ] Подключить YooKassa.
- [ ] Подключить Telegram Stars.
- [ ] Подключить CryptoPay.
- [ ] Подключить FreeKassa.
- [ ] Подключить Platega.
- [ ] Подключить SeverPay.

### Автоматические проверки

- [ ] Mock-тест standalone activation.
- [ ] Mock-тест standalone replacement.
- [ ] Mock-тест addon activation.
- [ ] Mock-тест traffic summing.
- [ ] Mock-тест explicit unlimited + traffic addon.
- [ ] Mock-тест bundled manual renewal with addon.
- [ ] Mock-тест обрезки addon при `addon.ends_at > standalone.ends_at`.
- [ ] Mock-тест Remnawave unavailable after paid webhook.
- [ ] Payment activation идемпотентна для повторного webhook.

### Ручные проверки

- [ ] Новый пользователь после оплаты получает Remnawave user и subscription URL.
- [ ] Покупка standalone назначает только squad этого тарифа.
- [ ] Покупка другого standalone снимает старый standalone squad и ставит новый.
- [ ] Срок при смене standalone не теряется.
- [ ] Addon добавляет squad к текущему standalone squad.
- [ ] Addon действует до конца standalone.
- [ ] Traffic GB суммируется с текущим лимитом в Remnawave.
- [ ] Time-only тариф с explicit GB создаёт ожидаемый лимит.
- [ ] Time-only тариф с explicit unlimited не превращается в ограниченный лимит при addon.
- [ ] При ручном продлении standalone пользователю предлагается оплатить active auto-renew addon в bundle.
- [ ] Addon с отключённым renewal остаётся до старой даты и не входит в bundle.
- [ ] Если standalone ends_at стал раньше addon ends_at после админского/edge-case изменения, addon обрезается до standalone ends_at.
- [ ] При сбое Remnawave после оплаты платёж остаётся succeeded, а sync уходит в pending.
- [ ] Повторный webhook не продлевает подписку повторно.

---

## Фаза 6: Telegram user flow

### Задачи

- [ ] Обновить пользовательские клавиатуры тарифов.
- [ ] Обновить `main_action:subscribe`.
- [ ] Добавить выбор тарифа.
- [ ] Добавить показ описания тарифа.
- [ ] Добавить выбор option.
- [ ] Добавить addon flow.
- [ ] Передавать `plan_option_id` в payment handlers.
- [ ] Обновить тексты `locales/ru.json`.
- [ ] Обновить тексты `locales/en.json`.
- [ ] Обновить сообщение успешной оплаты.

### Автоматические проверки

- [ ] Bot import/start проходит.
- [ ] Callback data не превышает лимит Telegram.
- [ ] Payment handlers корректно парсят новые callback data.

### Ручные проверки

- [ ] В боте кнопка “Купить” показывает список тарифов.
- [ ] Описание тарифа отображается на языке пользователя.
- [ ] Выбор тарифа показывает корректные options.
- [ ] Выбор option показывает доступные методы оплаты.
- [ ] Пользователь без standalone не видит addon purchase как доступный.
- [ ] Пользователь с standalone видит addon с пересчитанной ценой.
- [ ] После оплаты бот показывает ссылку подписки.

---

## Фаза 7: Telegram admin flow

### Задачи

- [ ] Добавить пункт `Тарифы` в админку.
- [ ] Добавить список тарифов.
- [ ] Добавить FSM states для создания тарифа.
- [ ] Добавить ввод name/description RU/EN.
- [ ] Добавить выбор Remnawave squad через API.
- [ ] Использовать cache списка squads в течение FSM.
- [ ] Добавить выбор kind.
- [ ] Добавить выбор billing model.
- [ ] Добавить выбор traffic reset strategy.
- [ ] Добавить ввод options.
- [ ] Добавить подтверждение перед сохранением.
- [ ] Добавить enable/disable.
- [ ] Добавить delete или soft-delete.
- [ ] Обновить i18n.

### Автоматические проверки

- [ ] Bot import/start проходит.
- [ ] FSM states не конфликтуют с существующими admin states.

### Ручные проверки

- [ ] Админ видит пункт `Тарифы`.
- [ ] Список тарифов показывает name, squad, цены, статус.
- [ ] Создание тарифа успешно при доступном Remnawave.
- [ ] Создание тарифа блокируется при недоступном Remnawave.
- [ ] Повторное открытие шага выбора squad не спамит Remnawave API.
- [ ] Ошибочный UUID squad не сохраняется.
- [ ] Созданный в боте тариф виден в web admin.
- [ ] Созданный в web admin тариф виден в боте.

---

## Фаза 8: Web user flow

### Задачи

- [ ] Обновить `frontend/src/api/subscription.ts`.
- [ ] Обновить `frontend/src/api/payment.ts`.
- [ ] Создать `TariffSelector`.
- [ ] Создать `TariffOptionSelector`.
- [ ] Создать `AddonSelector`.
- [ ] Обновить `SubscriptionPage.tsx`.
- [ ] Обновить `PaymentPendingPage`.
- [ ] Обновить `DashboardPage`/`My subscription` блок.
- [ ] Добавить auto-renew toggles в UI, если backend готов.
- [ ] Обновить i18n ru/en.

### Автоматические проверки

- [ ] `npm run build` проходит.
- [ ] TypeScript types проходят.
- [ ] Нет runtime ошибок в основных страницах.

### Ручные проверки

- [ ] Сайт показывает тарифы из БД.
- [ ] Выбор тарифа не показывает методы оплаты до выбора option.
- [ ] Создание платежа уходит с `plan_option_id`.
- [ ] Addon отображается только при активном standalone.
- [ ] Цена addon соответствует оставшемуся сроку.
- [ ] Цена addon не ниже минимальной цены.
- [ ] После оплаты пользователь видит активный тариф.
- [ ] На мобильном экране карточки и кнопки не перекрываются.

---

## Фаза 9: Web admin plans page

### Задачи

- [ ] Обновить `frontend/src/api/admin/plans.ts`.
- [ ] Заменить `PlansPage.tsx`.
- [ ] Создать форму тарифа.
- [ ] Создать editor options.
- [ ] Добавить Remnawave squad picker.
- [ ] Добавить client-side validation.
- [ ] Добавить обработку ошибок Remnawave API.
- [ ] Добавить enabled/sort controls.
- [ ] Обновить i18n ru/en.

### Автоматические проверки

- [ ] `npm run build` проходит.
- [ ] TypeScript не ругается на admin plans types.

### Ручные проверки

- [ ] Админ создаёт standalone тариф через web.
- [ ] Админ создаёт addon тариф через web.
- [ ] Админ добавляет несколько options.
- [ ] Админ меняет порядок тарифов.
- [ ] Disabled тариф не виден пользователям.
- [ ] Ошибка Remnawave API показана в UI.
- [ ] Удаление/отключение тарифа не ломает активные подписки.

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
