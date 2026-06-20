import {
  formatTelegramStats,
  getStats,
  sendTelegramMessage,
  telegramChatId,
  telegramSecret
} from './_analytics.js';
import { handleClientBotUpdate } from './_client-bot.js';

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

  try {
    const message = req.body?.message;
    const allowedChatId = telegramChatId();
    const range = parseRange(message?.text);
    const isAnalyticsRequest = message?.chat?.id
      && allowedChatId
      && String(message.chat.id) === String(allowedChatId)
      && range !== null;

    if (isAnalyticsRequest) {
      const stats = await getStats(range);
      await sendTelegramMessage(message.chat.id, formatTelegramStats(stats));
      return res.status(200).json({ success: true, handled: 'analytics' });
    }

    const handled = await handleClientBotUpdate(req.body || {});
    return res.status(200).json({
      success: true,
      handled: handled ? 'client-bot' : false
    });
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
    return res.status(200).json({ success: false });
  }
}
