# TajCodeLAB

Сайт и клиентский Telegram-бот IT-студии TajCodeLAB. Проект разворачивается на Vercel, состояние бота и аналитика хранятся в Upstash Redis.

## Клиентский бот

- выбор языка RU/TJ;
- каталог услуг и контакты;
- пошаговое создание заявки;
- хранение незавершённых диалогов и заявок в Redis;
- отправка заявки в админский Telegram-чат;
- статусы: новая → в работе → завершена/отклонена;
- уведомление клиента при смене статуса.

Команды аналитики в админском чате сохранены: `/today`, `/stats`, `/stats 30d`.

## Переменные Vercel

- `BOT_TOKEN` — токен от BotFather;
- `CHAT_ID` — чат для новых заявок;
- `ANALYTICS_CHAT_ID` — числовой ID админского чата;
- `BOT_ADMIN_IDS` — Telegram user ID администраторов через запятую;
- `TELEGRAM_WEBHOOK_SECRET` — случайная секретная строка;
- `DASHBOARD_KEY` — пароль API аналитики;
- `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` — доступ к Redis;
- `MANAGER_USERNAME` — username менеджера без `@`.

`ANALYTICS_CHAT_ID` должен быть числом. Для личного админского чата он может совпадать с `CHAT_ID`.

## Настройка

1. Создай бота через `@BotFather`.
2. Заполни переменные окружения в Vercel.
3. Задеплой проект.
4. Зарегистрируй webhook:

```bash
curl -X POST "https://YOUR-DOMAIN/api/setup-webhook" \
  -H "x-dashboard-key: YOUR_DASHBOARD_KEY"
```

5. Открой бота и отправь `/start`.

## Проверка

```bash
node --check api/_client-bot.js
node --check api/_analytics.js
node --check api/telegram-webhook.js
node --check api/setup-webhook.js
```

## Сценарий заявки

1. Клиент выбирает русский или таджикский язык.
2. Вводит имя, телефон, описание задачи и бюджет.
3. Бот отправляет карточку администратору.
4. Администратор меняет статус inline-кнопкой.
5. Клиент получает уведомление о новом статусе.
