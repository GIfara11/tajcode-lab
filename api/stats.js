import { getStats, verifyDashboardKey } from './_analytics.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!verifyDashboardKey(req)) {
    return res.status(401).json({ success: false, error: 'Invalid dashboard key' });
  }

  try {
    const stats = await getStats(req.query.range);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error('Analytics stats error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
}
