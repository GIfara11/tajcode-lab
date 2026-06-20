const DAY_MS = 86_400_000;
const TIME_ZONE = 'Asia/Dushanbe';

function env(name) {
  return String(process.env[name] || '').trim();
}

function redisRestUrl() {
  return env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
}

function redisRestToken() {
  return env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
}
export function assertRedis() {
  if (!redisRestUrl() || !redisRestToken()) {
    const error = new Error('Analytics storage is not configured');
    error.statusCode = 503;
    throw error;
  }
}

export async function redisPipeline(commands) {
  assertRedis();

  const response = await fetch(`${redisRestUrl()}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisRestToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error(`Analytics storage returned ${response.status}`);
  }

  const payload = await response.json();
  const failed = payload.find((item) => item.error);
  if (failed) throw new Error(failed.error);
  return payload.map((item) => item.result);
}

function dateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeRange(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 90);
}

function keysForRange(days) {
  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    result.push(dateKey(new Date(Date.now() - offset * DAY_MS)));
  }
  return result;
}

function flatHash(value) {
  const result = {};
  if (!Array.isArray(value)) return result;
  for (let index = 0; index < value.length; index += 2) {
    result[String(value[index])] = Number(value[index + 1]) || 0;
  }
  return result;
}

function cleanText(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

export async function recordEvent(input) {
  const day = dateKey(new Date());
  const event = input.event === 'lead' ? 'lead' : 'pageview';
  const visitorId = cleanText(input.visitorId, 80);
  const sessionId = cleanText(input.sessionId, 80);
  const path = cleanText(input.path, 160) || '/';
  const source = cleanText(input.source, 100) || 'Прямой переход';

  const commands = [
    ['HINCRBY', `analytics:totals:${day}`, event === 'lead' ? 'leads' : 'views', 1],
    ['EXPIRE', `analytics:totals:${day}`, 60 * 60 * 24 * 400]
  ];

  if (event === 'pageview') {
    commands.push(
      ['HINCRBY', `analytics:pages:${day}`, path, 1],
      ['HINCRBY', `analytics:sources:${day}`, source, 1],
      ['EXPIRE', `analytics:pages:${day}`, 60 * 60 * 24 * 400],
      ['EXPIRE', `analytics:sources:${day}`, 60 * 60 * 24 * 400]
    );
    if (visitorId) {
      commands.push(
        ['PFADD', `analytics:users:${day}`, visitorId],
        ['EXPIRE', `analytics:users:${day}`, 60 * 60 * 24 * 400]
      );
    }
    if (sessionId) {
      commands.push(
        ['PFADD', `analytics:sessions:${day}`, sessionId],
        ['EXPIRE', `analytics:sessions:${day}`, 60 * 60 * 24 * 400]
      );
    }
  }

  await redisPipeline(commands);
}

export async function getStats(rangeValue) {
  const range = normalizeRange(rangeValue);
  const days = keysForRange(range);
  const commands = [];

  for (const day of days) {
    commands.push(
      ['HGETALL', `analytics:totals:${day}`],
      ['HGETALL', `analytics:pages:${day}`],
      ['HGETALL', `analytics:sources:${day}`]
    );
  }

  commands.push(
    ['PFCOUNT', ...days.map((day) => `analytics:users:${day}`)],
    ['PFCOUNT', ...days.map((day) => `analytics:sessions:${day}`)]
  );

  const results = await redisPipeline(commands);
  const pages = {};
  const sources = {};
  const series = [];
  let views = 0;
  let leads = 0;

  days.forEach((day, index) => {
    const totals = flatHash(results[index * 3]);
    const dailyPages = flatHash(results[index * 3 + 1]);
    const dailySources = flatHash(results[index * 3 + 2]);

    views += totals.views || 0;
    leads += totals.leads || 0;
    Object.entries(dailyPages).forEach(([key, value]) => {
      pages[key] = (pages[key] || 0) + value;
    });
    Object.entries(dailySources).forEach(([key, value]) => {
      sources[key] = (sources[key] || 0) + value;
    });
    series.push({ date: day, views: totals.views || 0 });
  });

  const users = Number(results[days.length * 3]) || 0;
  const visits = Number(results[days.length * 3 + 1]) || 0;
  const conversion = visits ? Number(((leads / visits) * 100).toFixed(1)) : 0;
  const sortEntries = (value) => Object.entries(value)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    range,
    generatedAt: new Date().toISOString(),
    metrics: { views, users, visits, leads, conversion },
    series,
    pages: sortEntries(pages),
    sources: sortEntries(sources),
    botConfigured: Boolean(env('BOT_TOKEN') && (env('ANALYTICS_CHAT_ID') || env('CHAT_ID')))
  };
}

export function verifyDashboardKey(req) {
  const expected = env('DASHBOARD_KEY');
  const received = cleanText(req.headers['x-dashboard-key'], 200);
  return Boolean(expected && received && expected === received);
}

export function telegramChatId() {
  return env('ANALYTICS_CHAT_ID') || env('CHAT_ID');
}

export function telegramToken() {
  return env('BOT_TOKEN');
}

export function telegramSecret() {
  return env('TELEGRAM_WEBHOOK_SECRET');
}

export function formatTelegramStats(stats) {
  const topPage = stats.pages[0];
  const topSource = stats.sources[0];
  const period = stats.range === 1 ? 'сегодня' : `за ${stats.range} дн.`;

  return [
    `📊 TAJCODE LAB — ${period}`,
    '',
    `👁 Просмотры: ${stats.metrics.views.toLocaleString('ru-RU')}`,
    `🧭 Визиты: ${stats.metrics.visits.toLocaleString('ru-RU')}`,
    `👤 Пользователи: ${stats.metrics.users.toLocaleString('ru-RU')}`,
    `🎯 Заявки: ${stats.metrics.leads.toLocaleString('ru-RU')}`,
    `📈 Конверсия: ${stats.metrics.conversion}%`,
    '',
    `Топ-страница: ${topPage ? `${topPage.name} — ${topPage.count}` : 'нет данных'}`,
    `Топ-источник: ${topSource ? `${topSource.name} — ${topSource.count}` : 'нет данных'}`
  ].join('\n');
}

export async function telegramRequest(method, requestPayload) {
  const token = telegramToken();
  if (!token) throw new Error('BOT_TOKEN is not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload)
  });

  const responsePayload = await response.json();
  if (!responsePayload.ok) {
    throw new Error(responsePayload.description || `Telegram ${method} error`);
  }
  return responsePayload.result;
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options
  });
}
