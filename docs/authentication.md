# Аутентификация и email

Этот документ описывает все способы входа в веб-кабинет и настройку отправки
email:

- [Telegram Login (OIDC)](#telegram-login-oidc) — вход через виджет Telegram в браузере
- [Telegram Mini App](#telegram-mini-app-личный-кабинет-внутри-telegram) — автологин внутри Telegram
- [E-mail passwordless (magic code)](#e-mail-passwordless-magic-code) — вход по одноразовому коду без пароля
- [Resend — отправка email](#resend--отправка-email) — коды подтверждения для email-регистрации

> Режим главного меню бота (inline / webapp) описан отдельно — см.
> [bot-modes.md](bot-modes.md).

---

## Telegram Login (OIDC)

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

## Telegram Mini App (личный кабинет внутри Telegram)

Веб-кабинет можно открывать прямо внутри Telegram как **Mini App** — авторизация
проходит **автоматически**, без экрана входа: фронтенд берёт подписанный
`window.Telegram.WebApp.initData` и отправляет на `POST /api/auth/telegram/miniapp`,
бэкенд проверяет подпись HMAC-SHA256 по `BOT_TOKEN` и выдаёт JWT. Отдельных
переменных окружения не нужно — используются `BOT_TOKEN` и `WEB_FRONTEND_URL`.

> Это **не** то же самое, что Telegram Login (OIDC) выше. OIDC нужен для входа
> через виджет в обычном браузере; Mini App — для автологина внутри Telegram.
> Обе схемы работают параллельно: тот же URL, открытый в браузере, показывает
> обычный экран входа.

**Настройка в @BotFather:**

1. Откройте `@BotFather` → **Bot Settings** → **Menu Button** (или **Configure Mini App**).
2. Укажите URL кабинета — значение `WEB_FRONTEND_URL`, например:

   ```
   https://app.your-domain.com
   ```

3. (Опционально) Задайте **display mode**: `Compact`, `Fullsize` или `Fullscreen`.
   Кабинет учитывает safe-area Telegram во всех режимах — в `Fullscreen` шапка
   автоматически опускается ниже кнопок управления Telegram.

После этого кнопка меню (или ссылка `https://t.me/<bot>/<app>`) открывает кабинет
с моментальным входом.

**Нативный UX** включается автоматически: разворот на весь экран (`expand`),
синхронизация светлой/тёмной темы Telegram и нативная кнопка «Назад».

> **Админка на мобильном:** при открытии раздела «Админка» из Mini App или с
> мобильного браузера показывается предупреждение (много таблиц, не предназначено
> для мобильных) с выбором **«Продолжить»** / **«Вернуться»** — для админки
> предпочтительна десктопная версия.

---

## E-mail passwordless (magic code)

Вход по одноразовому 6-значному коду на e-mail, без пароля. Единый поток
«ввёл e-mail → получил код → вошёл»: неизвестный e-mail создаёт аккаунт,
известный — логинит (get-or-create). Отличается от `/auth/register/*` +
`/auth/login`, где код лишь верифицирует адрес при заведении пароля.

**`POST /api/auth/email/send-code`** — тело `{ "email": "you@mail.com" }` →
`{ "message": "Код отправлен на email" }`. Отправляет код (Resend, `purpose=login`),
если `RESEND_API_KEY` задан. Rate-limit 5/300с на IP. Ответ нейтрален независимо
от существования аккаунта.

**`POST /api/auth/email/verify`** — тело `{ "email", "code", "ref_code"? }` →
`TokenResponse` (access-JWT в теле + refresh-cookie `refresh_token`). Неверный или
истёкший код → `400 {"detail": "Неверный или истёкший код"}`. Rate-limit 10/300с.
Код одноразовый (повторная проверка → `400`). Аккаунт получает `is_email_verified=true`,
пароля не имеет (можно задать позже через сброс пароля).

> Требует настроенный Resend (см. ниже) — иначе код не отправляется.
> Telegram-вход и e-mail+пароль продолжают работать параллельно.

## Resend — отправка email

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
