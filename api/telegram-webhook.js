import {
  formatTelegramStats,
  getStats,
  sendTelegramMessage,
  telegramChatId,
  telegramSecret
} from './_analytics.js';

function parseRange(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (normalized === '/today' || normalized.startsWith('/today@')) return 1;

  const match = normalized.match(/^\/stats(?:@\w+)?(?:\s+(\d+)(?:d|д)?)?$/);
  if (!match) return null;
  return match[1] ? Number.parseInt(match[1], 10) : 7;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const secret = telegramSecret();
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
  }

  const message = req.body?.message;
  if (!message?.chat?.id) return res.status(200).json({ success: true });

  const allowedChatId = telegramChatId();
  if (!allowedChatId || String(message.chat.id) !== String(allowedChatId)) {
    return res.status(200).json({ success: true });
  }

  try {
    const range = parseRange(message.text);
    if (range === null) {
      await sendTelegramMessage(
        message.chat.id,
        'Команды аналитики:\n/today — сегодня\n/stats — 7 дней\n/stats 30d — 30 дней'
      );
      return res.status(200).json({ success: true });
    }

    const stats = await getStats(range);
    await sendTelegramMessage(message.chat.id, formatTelegramStats(stats));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Telegram analytics webhook error:', error.message);
    await sendTelegramMessage(message.chat.id, `Не удалось получить статистику: ${error.message}`)
      .catch(() => {});
    return res.status(200).json({ success: false });
  }
}
