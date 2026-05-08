export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: переменные окружения должны быть установлены
  if (!process.env.BOT_TOKEN || !process.env.CHAT_ID) {
    console.error('❌ Missing environment variables: BOT_TOKEN or CHAT_ID');
    return res.status(500).json({ 
      success: false, 
      error: 'Server configuration error. Contact support.' 
    });
  }

  try {
    const { name, phone, type, budget, message } = req.body;

    // Валидация входных данных
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and phone are required' 
      });
    }

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
      console.error('❌ Telegram API error:', data.description);
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Заявка отправлена успешно!'
    });

  } catch (error) {
    console.error('❌ Contact form error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Ошибка отправки. Попробуйте позже или напишите в @tajcodelab_bot'
    });
  }
}