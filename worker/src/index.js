/**
 * Genus Coffee — Stripe backend on Cloudflare Workers (free plan, no card).
 *
 * Routes:
 *   POST /            → whole-basket Checkout Session          (public)
 *   POST /subscribe   → subscription Checkout Session          (public)
 *   GET  /orders      → recent paid orders                     (admin)
 *   GET  /coupons     → list promotion codes                   (admin)
 *   POST /coupons     → create coupon + promotion code         (admin)
 *   GET  /subscriptions → list subscriptions                   (admin)
 *
 * Admin routes require a Firebase ID token: `Authorization: Bearer <token>`,
 * verified against Google's public keys with the email checked below.
 *
 * Secret: `wrangler secret put STRIPE_SECRET_KEY`.
 */
const CURRENCY = 'ron';
const PROJECT = 'shop-genus-coffee';
const ADMIN_EMAILS = ['adrian.danisab@gmail.com', 'orange10verde10@gmail.com'];

const ALLOWED_ORIGINS = [
  'https://shop-genus-coffee.web.app',
  'https://shop-genus-coffee.firebaseapp.com',
  'http://localhost:5055',
];

// Bundled price fallback (used only if a product isn't in Firestore yet).
// KEEP IN SYNC WITH public/js/data.js.
const PRODUCTS = {
  'el-triunfo':   { name: 'Genus Coffee — El Triunfo (Colombia Huila) 250g',       price: 79, description: 'Black tea, blackberry, chocolate' },
  'el-cerro':     { name: 'Genus Coffee — El Cerro (Costa Rica West Valley) 250g', price: 85, description: 'Caramel, panela, baked apple' },
  'guji-uraga':   { name: 'Genus Coffee — Guji Uraga (Ethiopia Guji) 250g',        price: 89, description: 'Tropical fruit, citrus, intense sweetness' },
  'masai-aa-top': { name: 'Genus Coffee — Masai AA Top (Kenya Mount Kenya) 250g',  price: 95, description: 'Blackcurrant, tropical fruit, clementine' },
  'simbi-kinazi': { name: 'Genus Coffee — Simbi Kinazi (Rwanda Huye) 250g',        price: 85, description: 'Red fruit, cinnamon, white chocolate' },
};

// Subscription plans. KEEP IN SYNC WITH SUBSCRIPTION_PLANS in public/js/data.js.
const SUBSCRIPTION_PLANS = {
  'monthly-1': { name: 'Genus Coffee — Monthly subscription (1 × 250g)', price: 79, interval: 'month' },
  'monthly-2': { name: 'Genus Coffee — Monthly subscription (2 × 250g)', price: 150, interval: 'month' },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(request.headers.get('Origin') || '');

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Server not configured' }, 500, cors);

    try {
      if (path === '/' && request.method === 'POST') return await createCheckout(request, env, cors);
      if (path === '/subscribe' && request.method === 'POST') return await createSubscription(request, env, cors);

      if (path === '/orders' && request.method === 'GET') return await guard(request, cors, () => listOrders(env, cors));
      if (path === '/coupons' && request.method === 'GET') return await guard(request, cors, () => listCoupons(env, cors));
      if (path === '/coupons' && request.method === 'POST') return await guard(request, cors, () => createCoupon(request, env, cors));
      if (path === '/subscriptions' && request.method === 'GET') return await guard(request, cors, () => listSubscriptions(env, cors));

      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      return json({ error: e.message || 'Server error' }, 500, cors);
    }
  },
};

/* ----------------------------------------------------------- public: checkout */
async function createCheckout(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json({ error: 'Your cart is empty.' }, 400, cors);

  const successUrl = safeUrl(body.successUrl) || `https://${PROJECT}.web.app/success.html`;
  const cancelUrl = safeUrl(body.cancelUrl) || `https://${PROJECT}.web.app/cart.html`;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', cancelUrl);
  form.set('phone_number_collection[enabled]', 'true');
  form.set('allow_promotion_codes', 'true');
  form.append('shipping_address_collection[allowed_countries][0]', 'RO');

  let i = 0;
  for (const it of items) {
    const p = await resolveProduct(String(it.id));
    if (!p) return json({ error: `Product "${it.id}" is unavailable.` }, 400, cors);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    form.append(`line_items[${i}][quantity]`, String(qty));
    form.append(`line_items[${i}][price_data][currency]`, CURRENCY);
    form.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
    form.append(`line_items[${i}][price_data][product_data][name]`, p.name);
    if (p.description) form.append(`line_items[${i}][price_data][product_data][description]`, p.description);
    i++;
  }

  const session = await stripe('/v1/checkout/sessions', env, 'POST', form);
  return json({ id: session.id, url: session.url }, 200, cors);
}

/* ----------------------------------------------------- public: subscription */
async function createSubscription(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const plan = SUBSCRIPTION_PLANS[String(body.planId)];
  if (!plan) return json({ error: 'Unknown plan.' }, 400, cors);

  const successUrl = safeUrl(body.successUrl) || `https://${PROJECT}.web.app/success.html`;
  const cancelUrl = safeUrl(body.cancelUrl) || `https://${PROJECT}.web.app/subscribe.html`;

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', cancelUrl);
  form.append('shipping_address_collection[allowed_countries][0]', 'RO');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', CURRENCY);
  form.set('line_items[0][price_data][unit_amount]', String(Math.round(plan.price * 100)));
  form.set('line_items[0][price_data][recurring][interval]', plan.interval || 'month');
  form.set('line_items[0][price_data][product_data][name]', plan.name);

  const session = await stripe('/v1/checkout/sessions', env, 'POST', form);
  return json({ id: session.id, url: session.url }, 200, cors);
}

/* --------------------------------------------------------------- admin: orders */
async function listOrders(env, cors) {
  const d = await stripe('/v1/checkout/sessions?limit=25&expand[]=data.line_items', env);
  const orders = (d.data || [])
    .filter((s) => s.status === 'complete' || s.payment_status === 'paid')
    .map((s) => ({
      id: s.id,
      created: s.created,
      email: s.customer_details?.email || null,
      name: s.customer_details?.name || null,
      amount: s.amount_total,
      currency: s.currency,
      status: s.payment_status,
      mode: s.mode,
      items: (s.line_items?.data || []).map((li) => ({ description: li.description, quantity: li.quantity })),
    }));
  return json({ orders }, 200, cors);
}

/* ------------------------------------------------------------ admin: coupons */
async function listCoupons(env, cors) {
  const d = await stripe('/v1/promotion_codes?limit=25&expand[]=data.coupon', env);
  const codes = (d.data || []).map((pc) => ({
    id: pc.id,
    code: pc.code,
    active: pc.active,
    timesRedeemed: pc.times_redeemed,
    maxRedemptions: pc.max_redemptions,
    percentOff: pc.coupon?.percent_off ?? null,
    amountOff: pc.coupon?.amount_off ?? null,
    currency: pc.coupon?.currency ?? null,
    duration: pc.coupon?.duration ?? null,
  }));
  return json({ codes }, 200, cors);
}

async function createCoupon(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const cForm = new URLSearchParams();
  if (body.percentOff) {
    cForm.set('percent_off', String(Number(body.percentOff)));
  } else if (body.amountOff) {
    cForm.set('amount_off', String(Math.round(Number(body.amountOff) * 100)));
    cForm.set('currency', CURRENCY);
  } else {
    return json({ error: 'Set a percent or amount off.' }, 400, cors);
  }
  cForm.set('duration', ['once', 'forever', 'repeating'].includes(body.duration) ? body.duration : 'once');
  if (body.name) cForm.set('name', String(body.name));
  const coupon = await stripe('/v1/coupons', env, 'POST', cForm);

  const pForm = new URLSearchParams();
  pForm.set('coupon', coupon.id);
  if (body.code) pForm.set('code', String(body.code).toUpperCase().replace(/\s+/g, ''));
  if (body.maxRedemptions) pForm.set('max_redemptions', String(parseInt(body.maxRedemptions, 10)));
  const promo = await stripe('/v1/promotion_codes', env, 'POST', pForm);

  return json({ ok: true, code: promo.code }, 200, cors);
}

/* ------------------------------------------------------ admin: subscriptions */
async function listSubscriptions(env, cors) {
  const d = await stripe('/v1/subscriptions?limit=25&status=all&expand[]=data.customer', env);
  const subs = (d.data || []).map((s) => ({
    id: s.id,
    status: s.status,
    created: s.created,
    currentPeriodEnd: s.current_period_end,
    email: s.customer?.email || null,
    name: s.customer?.name || null,
    amount: s.items?.data?.[0]?.price?.unit_amount ?? null,
    interval: s.items?.data?.[0]?.price?.recurring?.interval ?? null,
  }));
  return json({ subs }, 200, cors);
}

/* ------------------------------------------------------------------- helpers */
async function stripe(path, env, method = 'GET', form = null) {
  const res = await fetch('https://api.stripe.com' + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? form.toString() : undefined,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function resolveProduct(id) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products/${encodeURIComponent(id)}`;
    const r = await fetch(url);
    if (r.ok) {
      const f = (await r.json()).fields || {};
      const available = f.available ? f.available.booleanValue !== false : true;
      if (!available) return null;
      const price = f.price ? Number(f.price.integerValue ?? f.price.doubleValue) : NaN;
      if (Number.isFinite(price) && price > 0) {
        return { name: f.name?.stringValue || id, price, description: f.originLabel?.stringValue };
      }
    }
  } catch (_) { /* fall through */ }
  return PRODUCTS[id] || null;
}

async function guard(request, cors, fn) {
  const admin = await verifyAdmin(request);
  if (!admin) return json({ error: 'Unauthorized' }, 401, cors);
  return fn();
}

let _jwks = null, _jwksAt = 0;
async function getJwks() {
  if (_jwks && Date.now() - _jwksAt < 3600000) return _jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  _jwks = (await r.json()).keys;
  _jwksAt = Date.now();
  return _jwks;
}

async function verifyAdmin(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT) return null;
  if (payload.iss !== `https://securetoken.google.com/${PROJECT}`) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.email_verified !== true) return null;
  if (!ADMIN_EMAILS.includes(payload.email)) return null;

  try {
    const jwks = await getJwks();
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const sig = b64urlBytes(parts[2]);
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, dataBytes);
    return ok ? payload : null;
  } catch {
    return null;
  }
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function b64urlBytes(s) {
  const bin = b64urlDecode(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
function safeUrl(u) {
  try { const url = new URL(u); return url.origin + url.pathname; } catch { return null; }
}
