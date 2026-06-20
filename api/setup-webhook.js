import {
  telegramChatId,
  telegramSecret,
  telegramToken,
  verifyDashboardKey
} from './_analytics.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!verifyDashboardKey(req)) {
    return res.status(401).json({ success: false, error: 'Invalid dashboard key' });
  }

  const token = telegramToken();
  const chatId = telegramChatId();
  if (!token || !chatId) {
    return res.status(503).json({ success: false, error: 'Telegram is not configured' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const webhookUrl = `${proto}://${host}/api/telegram-webhook`;
  const payload = { url: webhookUrl, allowed_updates: ['message', 'callback_query'] };
  if (telegramSecret()) payload.secret_token = telegramSecret();

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Telegram API error');
    return res.status(200).json({ success: true, webhookUrl });
  } catch (error) {
    console.error('Webhook setup error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
