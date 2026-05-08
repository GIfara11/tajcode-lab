
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false });
  }

  try {
    const { name, phone, type, budget, message } = req.body;

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
      throw new Error('Telegram API error');
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error('Contact form error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Server error: ' + (error.message || 'Unknown error')
    });
  }
}
