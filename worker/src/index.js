/**
 * Genus Coffee — Stripe checkout on Cloudflare Workers (free plan, no card).
 *
 * POST { items:[{id, qty}], successUrl, cancelUrl } → { url } (Stripe Checkout).
 * Prices are resolved server-side from PRODUCTS below — the browser never sets
 * prices. Deploy with wrangler; the Stripe secret is a Worker secret, not code:
 *   cd worker && npx wrangler secret put STRIPE_SECRET_KEY   (paste sk_test_...)
 *   npx wrangler deploy
 * Then put the printed https://genus-checkout.<sub>.workers.dev URL into
 * CHECKOUT_ENDPOINT in public/js/checkout.js.
 */
const CURRENCY = 'ron';

// Server-side price authority. KEEP IN SYNC WITH public/js/data.js.
const PRODUCTS = {
  'el-triunfo':   { name: 'Genus Coffee — El Triunfo (Colombia Huila) 250g',        price: 79, description: 'Black tea, blackberry, chocolate' },
  'el-cerro':     { name: 'Genus Coffee — El Cerro (Costa Rica West Valley) 250g',  price: 85, description: 'Caramel, panela, baked apple' },
  'guji-uraga':   { name: 'Genus Coffee — Guji Uraga (Ethiopia Guji) 250g',         price: 89, description: 'Tropical fruit, citrus, intense sweetness' },
  'masai-aa-top': { name: 'Genus Coffee — Masai AA Top (Kenya Mount Kenya) 250g',   price: 95, description: 'Blackcurrant, tropical fruit, clementine' },
  'simbi-kinazi': { name: 'Genus Coffee — Simbi Kinazi (Rwanda Huye) 250g',         price: 85, description: 'Red fruit, cinnamon, white chocolate' },
};

// Browsers allowed to call this endpoint.
const ALLOWED_ORIGINS = [
  'https://shop-genus-coffee.web.app',
  'https://shop-genus-coffee.firebaseapp.com',
  'http://localhost:5055',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Server not configured' }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ error: 'Your cart is empty.' }, 400, cors);

    const successUrl = safeUrl(body.successUrl) || 'https://shop-genus-coffee.web.app/success.html';
    const cancelUrl = safeUrl(body.cancelUrl) || 'https://shop-genus-coffee.web.app/cart.html';

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', cancelUrl);
    params.set('phone_number_collection[enabled]', 'true');
    params.append('shipping_address_collection[allowed_countries][0]', 'RO');

    let i = 0;
    for (const it of items) {
      const p = PRODUCTS[String(it.id)];
      if (!p) return json({ error: `Product "${it.id}" is unavailable.` }, 400, cors);
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      params.append(`line_items[${i}][quantity]`, String(qty));
      params.append(`line_items[${i}][price_data][currency]`, CURRENCY);
      params.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
      params.append(`line_items[${i}][price_data][product_data][name]`, p.name);
      if (p.description) params.append(`line_items[${i}][price_data][product_data][description]`, p.description);
      i++;
    }

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await resp.json();
    if (data.error) return json({ error: data.error.message }, 400, cors);
    return json({ id: data.id, url: data.url }, 200, cors);
  },
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
function safeUrl(u) {
  try { const url = new URL(u); return url.origin + url.pathname; } catch { return null; }
}
