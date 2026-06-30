import { redisPipeline } from './_analytics.js';
import { cleanText } from './_security.js';

const INDEX_KEY = 'products:index';
const NEXT_ID_KEY = 'products:next_id';
const PRODUCT_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;
const STATUSES = new Set(['completed', 'support', 'hidden']);

function itemKey(id) {
  return `products:item:${id}`;
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  const source = cleanText(value, 90)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return source || `product-${Date.now()}`;
}

function flatHash(value) {
  const result = {};
  if (!Array.isArray(value)) return result;
  for (let index = 0; index < value.length; index += 2) {
    result[String(value[index])] = String(value[index + 1] || '');
  }
  return result;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function normalizeStack(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanText(item, 32))
      .filter(Boolean)
      .slice(0, 10)
      .join(', ');
  }

  return cleanText(value, 180)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(', ');
}

export function normalizeProduct(input, current = {}) {
  const title = cleanText(input.title ?? current.title, 120);
  const client = cleanText(input.client ?? current.client, 100);
  const type = cleanText(input.type ?? current.type, 70);
  const status = cleanText(input.status ?? current.status, 30);
  const completedAt = cleanText(input.completedAt ?? current.completedAt, 20);
  const url = cleanText(input.url ?? current.url, 220);
  const cover = cleanText(input.cover ?? current.cover, 220);
  const summary = cleanText(input.summary ?? current.summary, 420, { multiline: true });
  const stack = normalizeStack(input.stack ?? current.stack);
  const result = input.result ?? current.result;
  const visible = parseBoolean(input.visible ?? current.visible, true);
  const featured = parseBoolean(input.featured ?? current.featured, false);
  const slug = cleanText(input.slug ?? current.slug, 100) || slugify(title);

  return {
    title,
    client,
    type: type || 'Сайт',
    status: STATUSES.has(status) ? status : 'completed',
    completedAt,
    url,
    cover,
    summary,
    stack,
    result: cleanText(result, 160),
    visible: visible ? '1' : '0',
    featured: featured ? '1' : '0',
    slug
  };
}

export function productFromHash(hash) {
  return {
    id: hash.id || '',
    title: hash.title || '',
    client: hash.client || '',
    type: hash.type || 'Сайт',
    status: hash.status || 'completed',
    completedAt: hash.completedAt || '',
    url: hash.url || '',
    cover: hash.cover || '',
    summary: hash.summary || '',
    stack: hash.stack || '',
    result: hash.result || '',
    slug: hash.slug || '',
    visible: hash.visible !== '0',
    featured: hash.featured === '1',
    createdAt: hash.createdAt || '',
    updatedAt: hash.updatedAt || ''
  };
}

function validateProduct(product) {
  if (product.title.length < 2) {
    const error = new Error('Укажи название продукта.');
    error.statusCode = 400;
    throw error;
  }

  if (product.client.length < 2) {
    const error = new Error('Укажи клиента или внутреннее название.');
    error.statusCode = 400;
    throw error;
  }

  if (product.url && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(product.url)) {
    const error = new Error('Ссылка на проект должна начинаться с http:// или https://.');
    error.statusCode = 400;
    throw error;
  }

  if (product.cover && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(product.cover)) {
    const error = new Error('Ссылка на обложку должна начинаться с http:// или https://.');
    error.statusCode = 400;
    throw error;
  }
}

export async function listProducts() {
  const [ids] = await redisPipeline([['ZREVRANGE', INDEX_KEY, 0, 199]]);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const hashes = await redisPipeline(ids.map((id) => ['HGETALL', itemKey(id)]));
  return hashes
    .map(flatHash)
    .filter((item) => item.id)
    .map(productFromHash);
}

export async function createProduct(input) {
  const [id] = await redisPipeline([['INCR', NEXT_ID_KEY]]);
  const createdAt = nowIso();
  const normalized = normalizeProduct(input);
  validateProduct(normalized);

  const product = {
    id: String(id),
    ...normalized,
    createdAt,
    updatedAt: createdAt
  };

  await redisPipeline([
    ['HSET', itemKey(product.id), ...Object.entries(product).flat()],
    ['ZADD', INDEX_KEY, Date.now(), product.id],
    ['EXPIRE', itemKey(product.id), PRODUCT_TTL_SECONDS]
  ]);

  return productFromHash(product);
}

export async function updateProduct(idValue, input) {
  const id = cleanText(idValue, 40);
  if (!id) {
    const error = new Error('Не передан ID продукта.');
    error.statusCode = 400;
    throw error;
  }

  const [raw] = await redisPipeline([['HGETALL', itemKey(id)]]);
  const current = flatHash(raw);
  if (!current.id) {
    const error = new Error('Продукт не найден.');
    error.statusCode = 404;
    throw error;
  }

  const normalized = normalizeProduct(input, current);
  validateProduct(normalized);

  const product = {
    ...current,
    ...normalized,
    id,
    updatedAt: nowIso()
  };

  await redisPipeline([
    ['HSET', itemKey(id), ...Object.entries(product).flat()],
    ['EXPIRE', itemKey(id), PRODUCT_TTL_SECONDS]
  ]);

  return productFromHash(product);
}

export async function deleteProduct(idValue) {
  const id = cleanText(idValue, 40);
  if (!id) {
    const error = new Error('Не передан ID продукта.');
    error.statusCode = 400;
    throw error;
  }

  const [removed] = await redisPipeline([
    ['DEL', itemKey(id)],
    ['ZREM', INDEX_KEY, id]
  ]);

  if (!Number(removed)) {
    const error = new Error('Продукт не найден.');
    error.statusCode = 404;
    throw error;
  }

  return { id };
}
