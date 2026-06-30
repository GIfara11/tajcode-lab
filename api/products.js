import { verifyDashboardKey } from './_analytics.js';
import { createProduct, deleteProduct, listProducts, updateProduct } from './_products.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  cleanText,
  isPlainObject
} from './_security.js';

const MAX_BODY_BYTES = 12_000;

function methodConfig(method) {
  if (method === 'GET') return { scope: 'products-read', limit: 120, windowSeconds: 60 };
  return { scope: 'products-write', limit: 30, windowSeconds: 15 * 60 };
}

function assertAuthorized(req, res) {
  if (verifyDashboardKey(req)) return true;
  res.status(401).json({ success: false, error: 'Invalid dashboard key' });
  return false;
}

function assertBody(req) {
  if (!isPlainObject(req.body)) {
    const error = new Error('Некорректный формат данных.');
    error.statusCode = 400;
    throw error;
  }

  return req.body;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!assertAuthorized(req, res)) return;

  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ success: false, error: 'Размер данных слишком большой.' });
  }

  const config = methodConfig(req.method);
  const rateLimit = await checkRateLimit(req, config);
  applyRateLimitHeaders(res, rateLimit, config.limit);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Слишком много запросов к админке. Подожди и повтори.'
    });
  }

  try {
    res.setHeader('Cache-Control', 'private, no-store');

    if (req.method === 'GET') {
      const products = await listProducts();
      return res.status(200).json({ success: true, data: { products } });
    }

    if (req.method === 'POST') {
      const product = await createProduct(assertBody(req));
      return res.status(201).json({ success: true, data: { product } });
    }

    if (req.method === 'PATCH') {
      const body = assertBody(req);
      const product = await updateProduct(body.id, body);
      return res.status(200).json({ success: true, data: { product } });
    }

    const id = cleanText(req.query.id || req.body?.id, 40);
    const result = await deleteProduct(id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Products API error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
}
