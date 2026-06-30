import { adminHtml } from './_admin_page.js';
import { requireAdminPage } from './_admin_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  if (!requireAdminPage(req, res)) return;

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).send(adminHtml);
}
