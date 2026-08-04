# Апгрейд на Remnawave Panel 3.x

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
   Ненулевой `not_found` означает, что пользователя нет на панели: либо он был
   удалён, либо заведён под другим именем.

Шаг 5 не обязателен для работоспособности: любой пользователь с пустым
`panel_user_id` чинится лениво при первом обращении (см.
`core/services/panel_identity.py`). Скрипт лишь делает это разом и даёт отчёт.

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

## Защита от регрессий

`tests/test_panel_api_contract.py` сверяет все пути, которые дёргает
`core/services/panel_client.py`, со спекой `docs/remnawave-openapi-3.2.1.json`.
Живого стенда с v3 у нас нет, так что это единственная автоматическая защита
от опечатки в URL и от обращения к удалённому эндпоинту. При апгрейде панели
на следующую мажорную версию — обновите спеку в репозитории и прогоните тест.
