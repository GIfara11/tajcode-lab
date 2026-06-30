import { recordEvent } from './_analytics.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  cleanText,
  exceedsLength,
  isPlainObject
} from './_security.js';

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_SECONDS = 15 * 60;
const MAX_BODY_BYTES = 10_000;
const MAX_LENGTHS = {
  name: 80,
  phone: 100,
  type: 80,
  budget: 60,
  message: 2000,
  website: 200
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({
      success: false,
      error: 'Размер заявки превышает допустимый лимит.'
    });
  }

  const rateLimit = await checkRateLimit(req, {
    scope: 'contact',
    limit: CONTACT_LIMIT,
    windowSeconds: CONTACT_WINDOW_SECONDS
  });
  applyRateLimitHeaders(res, rateLimit, CONTACT_LIMIT);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Слишком много заявок. Попробуйте ещё раз через 15 минут.'
    });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({
      success: false,
      error: 'Некорректный формат данных.'
    });
  }

  const raw = req.body;

  // Honeypot: обычный пользователь это поле не видит и не заполняет.
  if (cleanText(raw.website, MAX_LENGTHS.website)) {
    return res.status(200).json({
      success: true,
      message: 'Заявка отправлена успешно!'
    });
  }

  const oversizedField = Object.entries(MAX_LENGTHS)
    .find(([field, maxLength]) => exceedsLength(raw[field], maxLength));

  if (oversizedField) {
    return res.status(400).json({
      success: false,
      error: 'Одно из полей превышает допустимую длину.'
    });
  }

  const name = cleanText(raw.name, MAX_LENGTHS.name);
  const phone = cleanText(raw.phone, MAX_LENGTHS.phone);
  const type = cleanText(raw.type, MAX_LENGTHS.type);
  const budget = cleanText(raw.budget, MAX_LENGTHS.budget);
  const message = cleanText(raw.message, MAX_LENGTHS.message, { multiline: true });

  if (name.length < 2 || phone.length < 3) {
    return res.status(400).json({
      success: false,
      error: 'Укажите корректное имя и контакт.'
    });
  }

  if (!process.env.BOT_TOKEN || !process.env.CHAT_ID) {
    console.error('Missing environment variables: BOT_TOKEN or CHAT_ID');
    return res.status(500).json({
      success: false,
      error: 'Сервис заявок временно недоступен. Напишите в @tajcodelab_bot.'
    });
  }

  try {
    const text = `
🚀 Новая заявка — TAJCODE LAB

👤 Имя: ${name}
📞 Контакт: ${phone}
📦 Проект: ${type || 'не указан'}
💰 Бюджет: ${budget || 'не указан'}

📝 Описание:
${message || 'не указано'}
`;

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: process.env.CHAT_ID,
          text
        })
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }

    try {
      await recordEvent({ event: 'lead' });
    } catch (analyticsError) {
      console.error('Lead analytics error:', analyticsError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Заявка отправлена успешно!'
    });
  } catch (error) {
    console.error('Contact form error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Ошибка отправки. Попробуйте позже или напишите в @tajcodelab_bot'
    });
  }
}
