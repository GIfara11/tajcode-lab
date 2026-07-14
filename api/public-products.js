import { listProducts } from './_products.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const products = await listProducts();
    const visibleProducts = products
      .filter((product) => product.visible && product.status !== 'hidden')
      .sort((left, right) => {
        if (left.featured !== right.featured) return right.featured - left.featured;
        return String(right.completedAt || right.createdAt)
          .localeCompare(String(left.completedAt || left.createdAt));
      })
      .slice(0, 12)
      .map((product) => ({
        id: product.id,
        title: product.title,
        client: product.client,
        type: product.type,
        completedAt: product.completedAt,
        url: product.url,
        cover: product.cover,
        summary: product.summary,
        stack: product.stack,
        result: product.result,
        featured: product.featured
      }));

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ success: true, data: { products: visibleProducts } });
  } catch (error) {
    console.error('Public products API error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: 'Products are temporarily unavailable'
    });
  }
}
