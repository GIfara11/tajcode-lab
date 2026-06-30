import { clearAdminSessionCookie } from './_admin_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  clearAdminSessionCookie(res);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ success: true });
}
