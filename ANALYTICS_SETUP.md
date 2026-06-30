# Аналитика, админка и Telegram-бот

## Что работает

- `index.html` отправляет просмотры в `/api/track` и заявки в `/api/contact`.
- `admin.html` показывает аналитику посещений, заявки, конверсию, источники и страницы.
- `admin.html` даёт CRUD для готовых клиентских продуктов: добавить, изменить, удалить, скрыть, закрепить.
- `api/products.js` хранит продукты в Upstash Redis.
- Telegram webhook принимает `/today`, `/stats` и `/stats 30d`.
- Старый `/dashboard.html` редиректит в новую админку.

## Переменные Vercel

Добавь в Vercel → Project → Settings → Environment Variables:

```text
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
DASHBOARD_KEY=длинный-случайный-пароль
ADMIN_USERNAME=admin
ADMIN_PASSWORD=опционально-отдельный-пароль-админки
BOT_TOKEN=токен-от-BotFather
CHAT_ID=id-чата-для-заявок
ANALYTICS_CHAT_ID=id-чата-для-аналитики
TELEGRAM_WEBHOOK_SECRET=длинная-случайная-строка
ADMIN_DOMAIN=admin.tajcode-lab.ru
```

`DASHBOARD_KEY` — главный ключ входа в админку и API статистики/продуктов. Без `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` аналитика и продукты будут возвращать `503`.

## Поддомен админки

В `vercel.json` уже добавлен host rewrite:

```text
admin.tajcode-lab.ru → /admin.html
```

Чтобы это реально заработало в проде:

1. В Vercel добавь домен `admin.tajcode-lab.ru` в тот же проект.
2. В DNS у регистратора добавь запись для `admin` по инструкции Vercel.
3. После валидации открой `https://admin.tajcode-lab.ru`.
4. Введи `DASHBOARD_KEY`.

Если поддомен ещё не подключен, админка доступна по `https://tajcode-lab.ru/api/admin` или через редирект `https://tajcode-lab.ru/admin.html`.

## Серверная защита админки

Админка отдаётся через `/api/admin`, а не как публичный статический HTML. Перед выдачей страницы сервер требует Basic Auth:

- логин: `ADMIN_USERNAME`, по умолчанию `admin`;
- пароль: `ADMIN_PASSWORD`, если задан; иначе используется `DASHBOARD_KEY`.

После успешного входа сервер ставит HttpOnly-cookie `taj_admin_session`, поэтому API `/api/stats` и `/api/products` принимает либо этот cookie, либо старый заголовок `x-dashboard-key`.

`/admin.html` оставлен только как редирект на защищённый `/api/admin`.
## API

### Статистика

```http
GET /api/stats?range=7
x-dashboard-key: DASHBOARD_KEY
```

### Продукты

```http
GET /api/products
POST /api/products
PATCH /api/products
DELETE /api/products?id=ID
x-dashboard-key: DASHBOARD_KEY
```

Обязательные поля для продукта: `title`, `client`. Остальное можно заполнять постепенно.

## Telegram

1. Открой `/admin.html` и проверь, что аналитика грузится.
2. Для webhook используй `/api/setup-webhook` с заголовком `x-dashboard-key`.
3. В боте доступны `/today`, `/stats`, `/stats 30d`.

## Важное ограничение

Это first-party аналитика без cookies и рекламного профилирования. Уникальные пользователи считаются по случайному ID в `localStorage`, сессии — по `sessionStorage`. Если пользователь очистит хранилище браузера, он будет считаться новым.
