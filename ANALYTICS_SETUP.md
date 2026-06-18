# Аналитика сайта и Telegram-бот

## Что работает

- `index.html` отправляет просмотры и успешные заявки в `/api/track`.
- `dashboard.html` показывает просмотры, визиты, пользователей, заявки, конверсию, источники и страницы.
- Telegram webhook принимает `/today`, `/stats` и `/stats 30d`.
- Данные хранятся в Upstash Redis с автоматическим удалением дневных ключей через 400 дней.

## Настройка Vercel

Создай бесплатную Redis-базу в Upstash и добавь в Vercel → Settings → Environment Variables:

```text
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
DASHBOARD_KEY=длинный-случайный-пароль
BOT_TOKEN=токен-от-BotFather
ANALYTICS_CHAT_ID=числовой-id-разрешённого-чата
TELEGRAM_WEBHOOK_SECRET=длинная-случайная-строка
```

`CHAT_ID` можно оставить для формы заявок. Для аналитики лучше использовать отдельный `ANALYTICS_CHAT_ID`.

## Запуск

1. Задеплой проект на Vercel.
2. Открой `/dashboard.html` и введи `DASHBOARD_KEY`.
3. Нажми «Подключить webhook».
4. Отправь боту `/today` или `/stats 30d`.

## Важное ограничение

Это first-party аналитика без cookies и рекламного профилирования. Уникальные пользователи считаются по случайному ID в `localStorage`, сессии — по `sessionStorage`. Очистка хранилища браузера создаёт нового пользователя.
