import { recordEvent } from './_analytics.js';

const ALLOWED_EVENTS = new Set(['pageview', 'lead']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const input = req.body || {};
    if (!ALLOWED_EVENTS.has(input.event)) {
      return res.status(400).json({ success: false, error: 'Unsupported event' });
    }

    await recordEvent(input);
    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Analytics tracking error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: 'Analytics event was not stored'
    });
  }
}
