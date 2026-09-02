# Апгрейд на Remnawave Panel 3.x

> Проверено на **Remnawave 3.2.1** (dev-стенд): бот стартует, backfill отрабатывает.

## Что изменилось в интеграции

- Пользователь панели адресуется числовым `id` вместо `uuid` — он лежит в
  `users.panel_user_id` и `subscriptions.panel_user_id`.
- `users.panel_user_uuid` и `subscriptions.panel_user_uuid` сохранены, но больше
  не читаются. Удалить их можно отдельной миграцией после стабилизации прода.
- Клиент панели теперь один — `core/services/panel_client.py`.
  `bot/services/panel_api_service.py` — re-export для обратной совместимости.
- CRYPT4 / happ-шифрование удалено: эндпоинта `POST /system/tools/happ/encrypt`
  в v3 нет. Переменные `CRYPT4_ENABLED` и `CRYPT4_REDIRECT_URL` убраны из
  `.env.example` — удалите их из своего файла окружения.

### Замены эндпоинтов

| v2 | v3 |
|---|---|
| `GET /users/{uuid}` | `GET /users/{userId}` |
| `POST /users/{uuid}/actions/*` | `POST /users/{userId}/actions/*` |
| `GET /users/by-telegram-id/{id}` | `GET /users/stream?telegramId=` |
| `GET /users/by-email/{email}` | `GET /users/stream?email=` |
| `GET /hwid/devices/{userUuid}` | `GET /hwid/devices/{userId}` |
| `POST /hwid/devices/delete` `{userUuid}` | то же тело с `{userId}` |
| `PATCH /users` `{uuid}` | `PATCH /users` `{id}` |
| GET+PATCH для продления | `POST /users/{userId}/actions/extend` `{days}` |
| `POST /system/tools/happ/encrypt` | удалён без замены |

Изменились и статусы: рестарт ноды теперь `202 Accepted` без тела, удаление
пользователя — `204 No Content`. Поля `usedTrafficBytes`, `onlineAt` и
`lifetimeUsedTrafficBytes` живут во вложенном объекте `userTraffic`, а
`subscriptionUuid` из объекта пользователя удалён — остался `shortUuid`.

`GET /users/by-username/{username}` в v3 сохранён. На нём держится вся
миграция: имя пользователя на панели детерминировано (`tg_<user_id>` для
Telegram, `web_<hex>` для веба), поэтому числовой id восстанавливается по нему.

## Порядок выката

1. Обновить панель до 3.2.1. На её стороне переименован секрет:
   `JWT_AUTH_SECRET` → `APP_SECRET`; удалены `JWT_API_TOKENS_SECRET`,
   `SWAGGER_PATH`, `SCALAR_PATH`, `IS_DOCS_ENABLED`.
2. Скоупы API-токена мигрируют автоматически (`ip-control:*` → `connections:*`).
   Проверить, что токен бота остался валидным.
3. `alembic upgrade head` — применяет `0021_panel_user_id`.
4. Задеплоить бота и web-API.
5. `python -m scripts.backfill_panel_user_id` — разобрать отчёт.

Шаг 5 не обязателен для работоспособности: любой пользователь с пустым
`panel_user_id` чинится лениво при первом обращении (см.
`core/services/panel_identity.py`). Скрипт лишь делает это разом и даёт отчёт.

В docker-развёртывании:

```bash
docker exec remnawave-tg-shop python -m scripts.backfill_panel_user_id
```

### Как читать отчёт backfill

```
INFO Backfill finished: resolved=2 not_found=35 skipped=0
```

- `resolved` — идентификатор найден и записан.
- `skipped` — у пользователя уже был `panel_user_id`, запись не трогали.
- `not_found` — панель не подтвердила пользователя ни по имени
  (`tg_<user_id>` / `web_<hex>`), ни по `telegramId`.

**Большой `not_found` — нормально для старой базы.** В таблице `users` копятся
все, кто когда-либо нажал `/start`: без подписки панельного пользователя у них
нет и не было. То же самое с теми, кого удалили из панели вручную. Такие записи
не требуют действий — при первой же покупке пользователь будет заведён заново.

Насторожиться стоит, если `not_found` покрывает пользователей **с активной
подпиской**. Проверить это можно так:

```sql
SELECT u.user_id, s.end_date
FROM users u
JOIN subscriptions s ON s.user_id = u.user_id
WHERE u.panel_user_id IS NULL
  AND s.is_active
  AND s.end_date > now();
```

Пустой результат — всё в порядке.

Пользователь, заведённый на панели **вручную под произвольным именем**, по имени
не находится, но подхватывается второй ступенью — поиском по `telegramId`
(проверено на боевых данных). Ручное вмешательство нужно только если на панели
у него вдобавок не проставлен `telegramId`: тогда найдите его в панели и
пропишите идентификатор напрямую —

```sql
UPDATE users SET panel_user_id = <id_из_панели> WHERE user_id = <telegram_id>;
```

## Smoke-test после выката

- покупка подписки (любой провайдер)
- активация триала новым пользователем
- список устройств и отключение устройства в кабинете
- бан / разбан пользователя из админки
- выдача дней и трафика из админки
- рестарт ноды из админки (v3 отвечает 202 без тела)
- приход вебхука `user.expiration` и уведомление в Telegram

## Откат

Revert деплоя приложения + откат панели до 2.x. Данные в `panel_user_uuid`
сохранены нетронутыми, откатанный код найдёт их на месте. Колонка
`panel_user_id` для v2-кода безвредна — миграцию откатывать не обязательно.

## Минорные апгрейды 3.x: 3.2.1 → 3.4.3

**Правок в коде не требуется.** Сверка контракта панели между тегами `3.2.1` и
`3.4.3` (`libs/contract` в репозитории `remnawave/backend`) показала:

- в `libs/contract/api/routes.ts` **ни одной удалённой строки** — ни один путь
  не удалён и не переименован;
- скоупы API-токена (`constants/scopes/scope.ts`) не менялись — токен бота
  остаётся валидным без переоформления;
- схемы вебхуков (`models/webhook/webhook.schema.ts`) и список событий
  (`constants/events/events.ts`) не менялись вовсе — `panel_webhook_service.py`
  не затронут;
- команды `users`, `hwid`, `system`, `bandwidth-stats` не менялись. Единственная
  правка в схеме пользователя — `vlessUuid: z.uuid()` → `z.guid()`, то есть
  ослабление валидации на стороне панели.

Новые поля в ответах — аддитивные: `tags` у internal squads и subpage-конфигов,
`ips` и `integrationUuids` у нод. Схемы проекта их игнорируют: ни в
`web/schemas/`, ни в `core/` нет `extra="forbid"`.

### Что нужно сделать на стенде

1. **Обновить ноды вместе с панелью.** Контракт панель↔нода вырос мажорно:
   `@remnawave/node-contract` `2.9.0` → `3.4.1`.
2. Панель применит 6 своих миграций (`add_node_ips`, `add_host_mapper`,
   `add_node_integrations`, `add_shared_lists`, `host_exclusion_modes`,
   `add_entity_tags`). Все аддитивные, таблицу `users` не трогают.
3. Миграции бота (`alembic upgrade head`) и `backfill_panel_user_id` повторно
   прогонять не нужно — они относятся к переходу 2.x → 3.x.
4. 3.4.3 закрывает уязвимость: обход аутентификации в backend-tools через путь
   в смешанном регистре. Это самостоятельный повод обновиться.

### Новая опция панели: SHORT_UUID_METHOD

В 3.4.0 появилась настройка формата идентификатора подписки
(`SHORT_UUID_METHOD` = `nanoid` | `uuid` | `custom`, длина до 64 символов).
По умолчанию — прежний `nanoid`/16. Менять на нашей стороне нечего:
`subscriptions.panel_subscription_uuid` объявлен как `String` без ограничения
длины, поэтому любой из форматов помещается.

## Защита от регрессий

`tests/test_panel_api_contract.py` сверяет все пути, которые дёргает
`core/services/panel_client.py`, со спекой `docs/remnawave-openapi-3.4.3.json`.
Живого стенда с v3 у нас нет, так что это единственная автоматическая защита
от опечатки в URL и от обращения к удалённому эндпоинту. При апгрейде панели
на следующую мажорную версию — обновите спеку в репозитории и прогоните тест.
