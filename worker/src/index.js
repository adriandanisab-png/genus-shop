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
 *   GET  /plans       → Genus Coffee Box plan table            (public)
 *   POST /review/credit → 25 lei credit for a 1–2★ box rating  (review token)
 *   GET  /account/subscription, POST /account/{portal,skip,change,reactivate}
 *                     → customer self-service                  (signed-in customer)
 *
 * Admin and account routes require a Firebase ID token: `Authorization: Bearer <token>`,
 * verified against Google's public keys (admin routes also check the email below).
 * Box data contract: handoff/docs/box-data.md.
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
  // Genus Coffee Box one-off and gift boxes (handoff/docs/pricing.md). Gifts are prepaid, never subscriptions.
  'box-duo':    { name: 'Genus Coffee Box — Duo, o singură dată (2 × 250g)',  price: 179, description: '1 prăjitorie invitată + Genus' },
  'box-trio':   { name: 'Genus Coffee Box — Trio, o singură dată (3 × 250g)', price: 239, description: '2 prăjitorii invitate + Genus' },
  'box-gift-1': { name: 'Genus Coffee Box — Gift Trio, 1 cutie',             price: 259, description: 'Cutie cadou cu bilet scris de mână' },
  'box-gift-3': { name: 'Genus Coffee Box — Gift Trio, 3 luni (plătit integral)', price: 639, description: 'Trimisă lunar, 3 cutii' },
  'box-gift-6': { name: 'Genus Coffee Box — Gift Trio, 6 luni (plătit integral)', price: 1249, description: 'Trimisă lunar, 6 cutii' },
};

// Genus Coffee Box subscriptions: monthly or every 2 months (interval_count 1 | 2).
const BOX_PLANS = {
  duo:     { name: 'Genus Coffee Box — Duo (2 × 250g)', price: 159, intervals: [1, 2] },
  trio:    { name: 'Genus Coffee Box — Trio (3 × 250g)', price: 219, intervals: [1, 2] },
  reserve: { name: 'Genus Coffee Box — Reserve (3 × 250g, micro-lot)', price: 259, intervals: [1, 2] },
};
// Founding offer: first Trio box at 199 lei for sign-ups until 31 Jan 2027 (a once-only coupon).
const FOUNDING = { plan: 'trio', firstBoxPrice: 199, endsAt: '2027-01-31T23:59:59+02:00', couponId: 'box-founding-trio' };
const REVIEW_CREDIT_LEI = 25;

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
    // The plan table needs no Stripe key, so /box pages show prices before payments are connected.
    if (path === '/plans' && request.method === 'GET') return plansResponse(cors);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Plățile nu sunt conectate încă. Revino în curând.' }, 503, cors);

    try {
      if (path === '/' && request.method === 'POST') return await createCheckout(request, env, cors);
      if (path === '/subscribe' && request.method === 'POST') return await createSubscription(request, env, cors);
      if (path === '/webhook' && request.method === 'POST') return await handleWebhook(request, env);
      if (path === '/review/credit' && request.method === 'POST') return await reviewCredit(request, env, cors);
      if (path.startsWith('/account/')) return await userGuard(request, cors, (u) => account(path, request, u, env, cors));

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
  if (!body.box) form.append('shipping_address_collection[allowed_countries][0]', 'RO');
  applyBoxFields(form, body, 'payment_intent_data[metadata]');

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
  if (body.box) return createBoxSubscription(body, env, cors);
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


/* ---------------------------------------------------------- Genus Coffee Box */
function foundingActive() { return Date.now() <= Date.parse(FOUNDING.endsAt); }

function plansResponse(cors) {
  const subscriptions = {};
  for (const [k, p] of Object.entries(BOX_PLANS)) subscriptions[k] = { name: p.name, price: p.price, intervals: p.intervals };
  const pick = (id) => ({ id, price: PRODUCTS[id].price });
  return json({
    subscriptions,
    oneOff: { duo: pick('box-duo'), trio: pick('box-trio') },
    gift: { 1: pick('box-gift-1'), 3: pick('box-gift-3'), 6: pick('box-gift-6') },
    founding: { active: foundingActive(), plan: FOUNDING.plan, firstBoxPrice: FOUNDING.firstBoxPrice, endsAt: FOUNDING.endsAt },
  }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
}

// Customer + gift details travel as Stripe metadata (max 500 chars per value).
const clip = (v, n = 490) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
function applyBoxFields(form, body, metaPrefix) {
  if (!body.box) return;
  const c = body.customer || {};
  const meta = { box: 'true', locker: clip(c.locker), name: clip(c.name, 120), phone: clip(c.phone, 40) };
  if (body.gift) {
    meta.gift = 'true';
    meta.giftRecipient = clip(body.gift.recipient, 120);
    meta.giftAddress = clip(body.gift.address);
    meta.giftNote = clip(body.gift.note, 200);
    meta.giftMonths = clip(body.gift.months, 2);
  }
  if (body.tasteProfile) meta.tasteProfile = clip(JSON.stringify(body.tasteProfile));
  if (body.plan) { meta.plan = clip(body.plan, 20); meta.intervalCount = String(body.interval_count); }
  for (const [k, v] of Object.entries(meta)) {
    if (!v) continue;
    form.set(`metadata[${k}]`, v);
    if (metaPrefix) form.set(`${metaPrefix}[${k}]`, v);
  }
  if (c.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) form.set('customer_email', clip(c.email, 200));
}

async function createBoxSubscription(body, env, cors) {
  const plan = BOX_PLANS[String(body.plan)];
  const ic = parseInt(body.interval_count, 10);
  if (!plan || !plan.intervals.includes(ic)) return json({ error: 'Plan necunoscut.' }, 400, cors);
  if (!body.customer?.locker) return json({ error: 'Alege un easybox sau FANbox.' }, 400, cors);

  const successUrl = safeUrl(body.successUrl) || `https://${PROJECT}.web.app/success.html`;
  const cancelUrl = safeUrl(body.cancelUrl) || `https://${PROJECT}.web.app/box/plan.html`;
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', `${successUrl}?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', cancelUrl);
  form.set('phone_number_collection[enabled]', 'true');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', CURRENCY);
  form.set('line_items[0][price_data][unit_amount]', String(plan.price * 100));
  form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('line_items[0][price_data][recurring][interval_count]', String(ic));
  form.set('line_items[0][price_data][product_data][name]', plan.name);
  applyBoxFields(form, { ...body, interval_count: ic }, 'subscription_data[metadata]');

  // The server decides the founding discount; the client's `coupon` is only a hint.
  if (body.plan === FOUNDING.plan && foundingActive()) {
    await ensureFoundingCoupon(env, plan.price - FOUNDING.firstBoxPrice);
    form.set('discounts[0][coupon]', FOUNDING.couponId);
  } else {
    form.set('allow_promotion_codes', 'true');
  }
  const session = await stripe('/v1/checkout/sessions', env, 'POST', form);
  return json({ id: session.id, url: session.url }, 200, cors);
}

async function ensureFoundingCoupon(env, offLei) {
  try { await stripe(`/v1/coupons/${FOUNDING.couponId}`, env); return; } catch (_) { /* create below */ }
  const f = new URLSearchParams();
  f.set('id', FOUNDING.couponId);
  f.set('name', `Prima cutie Trio ${FOUNDING.firstBoxPrice} lei`);
  f.set('amount_off', String(offLei * 100));
  f.set('currency', CURRENCY);
  f.set('duration', 'once');
  f.set('redeem_by', String(Math.floor(Date.parse(FOUNDING.endsAt) / 1000)));
  await stripe('/v1/coupons', env, 'POST', f);
}

// A 1–2★ rating earns 25 lei off the next invoice, once per subscriber per box.
async function reviewCredit(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || ''), boxId = String(body.boxId || ''), coffeeId = String(body.coffeeId || '');
  if (!/^[\w-]{16,}$/.test(token) || !/^\d{4}-\d{2}$/.test(boxId) || !/^[\w-]+$/.test(coffeeId)) return json({ error: 'Bad request' }, 400, cors);
  const rt = await firestoreGet(env, `reviewTokens/${token}`);
  if (!rt) return json({ error: 'Linkul a expirat' }, 404, cors);
  const rating = await firestoreGet(env, `ratings/${boxId}_${token}_${coffeeId}`);
  if (!rating || !(rating.stars >= 1 && rating.stars <= 2)) return json({ credited: false }, 200, cors);
  const creditPath = `credits/${rt.subscriberId}_${boxId}`;
  if (await firestoreGet(env, creditPath)) return json({ credited: true, already: true }, 200, cors);

  const f = new URLSearchParams();
  f.set('amount', String(-REVIEW_CREDIT_LEI * 100));
  f.set('currency', CURRENCY);
  f.set('description', `Garanția Genus Box ${boxId}: ${coffeeId}`);
  await stripe(`/v1/customers/${rt.subscriberId}/balance_transactions`, env, 'POST', f);
  await firestoreUpsert(env, creditPath, { amount: REVIEW_CREDIT_LEI, coffeeId, boxId, subscriberId: rt.subscriberId });
  return json({ credited: true }, 200, cors);
}

/* ------------------------------------------------- customer self-service */
async function userGuard(request, cors, fn) {
  const u = await verifyIdToken(request);
  if (!u || !u.email) return json({ error: 'Intră din nou în cont.' }, 401, cors);
  return fn(u);
}

async function findBoxSubscription(env, email) {
  const cs = await stripe(`/v1/customers?limit=10&email=${encodeURIComponent(email)}`, env);
  let best = null;
  for (const c of cs.data || []) {
    const subs = await stripe(`/v1/subscriptions?limit=10&status=all&customer=${c.id}`, env);
    for (const s of subs.data || []) {
      if (s.metadata?.box !== 'true') continue;
      if (!best || (best.status === 'canceled' && s.status !== 'canceled') || (s.status === best.status && s.created > best.created)) best = s;
    }
  }
  return best;
}

async function account(path, request, u, env, cors) {
  const sub = await findBoxSubscription(env, u.email.toLowerCase());
  if (!sub) return json({ error: 'Nu am găsit niciun abonament.' }, 404, cors);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/account/subscription' && request.method === 'GET') {
    return json({ subscription: subSummary(sub) }, 200, cors);
  }
  if (path === '/account/portal' && request.method === 'POST') {
    const f = new URLSearchParams();
    f.set('customer', sub.customer);
    f.set('return_url', `https://${PROJECT}.web.app/account.html`);
    const s = await stripe('/v1/billing_portal/sessions', env, 'POST', f);
    return json({ url: s.url }, 200, cors);
  }
  if (path === '/account/skip' && request.method === 'POST') {
    // Void the next invoice: resume collection just after the coming renewal.
    const f = new URLSearchParams();
    f.set('pause_collection[behavior]', 'void');
    f.set('pause_collection[resumes_at]', String(periodEnd(sub) + 86400));
    await stripe(`/v1/subscriptions/${sub.id}`, env, 'POST', f);
    return json({ ok: true }, 200, cors);
  }
  if (path === '/account/change' && request.method === 'POST') {
    const plan = BOX_PLANS[String(body.plan)];
    const ic = parseInt(body.interval_count, 10);
    if (!plan || !plan.intervals.includes(ic)) return json({ error: 'Plan necunoscut.' }, 400, cors);
    const pf = new URLSearchParams();
    pf.set('currency', CURRENCY);
    pf.set('unit_amount', String(plan.price * 100));
    pf.set('recurring[interval]', 'month');
    pf.set('recurring[interval_count]', String(ic));
    pf.set('product_data[name]', plan.name);
    const price = await stripe('/v1/prices', env, 'POST', pf);
    const f = new URLSearchParams();
    f.set('items[0][id]', sub.items.data[0].id);
    f.set('items[0][price]', price.id);
    f.set('proration_behavior', 'none');
    f.set('metadata[plan]', String(body.plan));
    f.set('metadata[intervalCount]', String(ic));
    await stripe(`/v1/subscriptions/${sub.id}`, env, 'POST', f);
    return json({ ok: true }, 200, cors);
  }
  if (path === '/account/reactivate' && request.method === 'POST') {
    if (sub.status === 'canceled') return json({ error: 'Abonamentul a fost anulat. Fă o comandă nouă din /box.' }, 409, cors);
    const f = new URLSearchParams();
    f.set('pause_collection', '');
    f.set('cancel_at_period_end', 'false');
    await stripe(`/v1/subscriptions/${sub.id}`, env, 'POST', f);
    return json({ ok: true }, 200, cors);
  }
  return json({ error: 'Not found' }, 404, cors);
}

function periodEnd(s) { return s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? 0; }
function subSummary(s) {
  return {
    id: s.id,
    status: s.pause_collection ? 'paused' : s.status,
    plan: s.metadata?.plan || null,
    intervalCount: s.items?.data?.[0]?.price?.recurring?.interval_count ?? null,
    currentPeriodEnd: periodEnd(s),
    pauseResumesAt: s.pause_collection?.resumes_at ?? null,
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
  };
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
  const p = await verifyIdToken(request);
  return p && ADMIN_EMAILS.includes(p.email) ? p : null;
}

async function verifyIdToken(request) {
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
  // Firebase Hosting preview channels: https://shop-genus-coffee--<channel>.web.app
  const isPreview = new RegExp(`^https://${PROJECT}--[a-z0-9-]+\\.web\\.app$`).test(origin);
  const allow = ALLOWED_ORIGINS.includes(origin) || isPreview ? origin : ALLOWED_ORIGINS[0];
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

/* ------------------------------------------------ webhook → Firestore orders */
// Stripe → on checkout.session.completed, record a paid order to Firestore so
// /admin Orders reads from the database, not the live Stripe API.
// Needs secrets: STRIPE_WEBHOOK_SECRET, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
async function handleWebhook(request, env) {
  const raw = await request.text();
  const ok = await verifyStripeSig(raw, request.headers.get('Stripe-Signature') || '', env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('Invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response('Bad payload', { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    let items = [];
    try {
      const li = await stripe(`/v1/checkout/sessions/${s.id}/line_items?limit=100`, env);
      items = (li.data || []).map((x) => ({ description: x.description || '', quantity: x.quantity || 1, amount: x.amount_total || 0 }));
    } catch (_) { /* items best-effort */ }

    const order = {
      sessionId: s.id,
      email: s.customer_details?.email || null,
      name: s.customer_details?.name || null,
      phone: s.customer_details?.phone || null,
      amount: s.amount_total,
      currency: s.currency,
      status: s.payment_status || 'paid',
      mode: s.mode || 'payment',
      items,
      metadata: s.metadata || {},
    };
    try {
      await firestoreUpsert(env, `orders/${s.id}`, order, s.created);
      if (s.mode === 'subscription' && s.metadata?.box === 'true') await recordSubscriber(env, s);
    } catch (e) {
      return new Response('Record failed: ' + e.message, { status: 500 }); // Stripe will retry
    }
  } else if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const sub = event.data.object;
    if (sub.metadata?.box === 'true') {
      const sum = subSummary(sub);
      try {
        await firestorePatch(env, `subscribers/${sub.customer}`, {
          status: sum.status, intervalCount: sum.intervalCount, currentPeriodEnd: sum.currentPeriodEnd,
          ...(sum.plan ? { plan: sum.plan } : {}), cancelAtPeriodEnd: sum.cancelAtPeriodEnd,
        });
      } catch (e) { return new Response('Record failed: ' + e.message, { status: 500 }); }
    }
  } else if (event.type === 'invoice.paid') {
    const inv = event.data.object;
    if (inv.subscription_details?.metadata?.box === 'true' || inv.parent?.subscription_details?.metadata?.box === 'true') {
      try { await firestorePatch(env, `subscribers/${inv.customer}`, { lastPaidAt: inv.status_transitions?.paid_at || Math.floor(Date.now() / 1000) }); }
      catch (e) { return new Response('Record failed: ' + e.message, { status: 500 }); }
    }
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// First paid box subscription → subscribers/{customerId} + a review token for the QR cards.
async function recordSubscriber(env, s) {
  const path = `subscribers/${s.customer}`;
  const existing = await firestoreGet(env, path);
  const email = (s.customer_details?.email || '').toLowerCase();
  const token = existing?.reviewToken || randomToken();
  let sub = null;
  try { sub = await stripe(`/v1/subscriptions/${s.subscription}`, env); } catch (_) { /* best effort */ }
  let tasteProfile = null;
  try { tasteProfile = s.metadata.tasteProfile ? JSON.parse(s.metadata.tasteProfile) : null; } catch (_) { /* ignore */ }
  await firestorePatch(env, path, {
    email, customerId: s.customer, subscriptionId: s.subscription,
    name: s.metadata.name || s.customer_details?.name || null,
    phone: s.metadata.phone || s.customer_details?.phone || null,
    plan: s.metadata.plan || null, intervalCount: Number(s.metadata.intervalCount) || 1,
    status: sub ? subSummary(sub).status : 'active', currentPeriodEnd: sub ? periodEnd(sub) : null,
    locker: s.metadata.locker || null, reviewToken: token,
    ...(tasteProfile ? { tasteProfile } : {}),
    ...(existing ? {} : { swaps: {}, skipMonths: [] }),
  });
  if (!existing?.reviewToken) await firestoreUpsert(env, `reviewTokens/${token}`, { subscriberId: s.customer, email });
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return b64urlEncodeBytes(b);
}

async function verifyStripeSig(payload, header, secret) {
  if (!secret || !header) return false;
  const parts = header.split(',').map((kv) => kv.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const v1s = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !v1s.length) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return v1s.some((v1) => v1.length === hex.length && timingSafeEq(hex, v1));
}
function timingSafeEq(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Convert a JS object to Firestore REST typed fields.
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}
function toFsFields(obj) {
  const f = {};
  for (const [k, val] of Object.entries(obj)) if (val !== undefined) f[k] = toFsValue(val);
  return f;
}

async function firestoreUpsert(env, path, obj, createdUnix) {
  const token = await getAccessToken(env);
  const fields = toFsFields(obj);
  fields.createdAt = { timestampValue: new Date((createdUnix || Math.floor(Date.now() / 1000)) * 1000).toISOString() };
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`firestore ${r.status} ${(await r.text()).slice(0, 140)}`);
}

// Merge-update only the given fields (Firestore updateMask); creates the doc if missing.
async function firestorePatch(env, path, obj) {
  const token = await getAccessToken(env);
  const fields = toFsFields(obj);
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}?${mask}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`firestore ${r.status} ${(await r.text()).slice(0, 140)}`);
}

// Read one doc as a plain object (null if missing).
async function firestoreGet(env, path) {
  const token = await getAccessToken(env);
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore ${r.status}`);
  return fromFsFields((await r.json()).fields || {});
}
function fromFsValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}
function fromFsFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) o[k] = fromFsValue(v);
  return o;
}

// Service-account OAuth token (scope: datastore) via a signed JWT.
let _sa = null, _saAt = 0;
async function getAccessToken(env) {
  if (_sa && Date.now() - _saAt < 3000000) return _sa;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('Firebase service account not configured');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwtRS256({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }, env.FIREBASE_PRIVATE_KEY);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('token exchange failed: ' + (d.error_description || d.error || r.status));
  _sa = d.access_token; _saAt = Date.now();
  return _sa;
}

async function signJwtRS256(claims, pem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claims))}`;
  const key = await importPkcs8(pem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64urlEncodeBytes(new Uint8Array(sig))}`;
}
function b64urlStr(s) { return b64urlEncodeBytes(new TextEncoder().encode(s)); }
function b64urlEncodeBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function importPkcs8(pem) {
  const clean = pem.replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
