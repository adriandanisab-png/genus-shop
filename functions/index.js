/**
 * Genus Coffee — Cloud Functions (Firebase Functions v2).
 *
 *  createCheckoutSession  (callable)  — cart [{id, qty}] → Stripe Checkout Session URL.
 *                                       Prices are read from Firestore `products`
 *                                       server-side; the client never sets prices.
 *  stripeWebhook          (HTTP)      — Stripe → on checkout.session.completed,
 *                                       write a paid `orders` doc (idempotent).
 *
 * Secrets (set once, see SETUP.md):
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 */
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();

// Keep region in sync with FUNCTIONS_REGION in public/js/firebase.js.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const CURRENCY = 'ron'; // must match CURRENCY in public/js/data.js
const SHIP_COUNTRIES = ['RO'];

function clampQty(q) {
  const n = parseInt(q, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, n));
}

// Authoritative price fallback so checkout works right after deploy, before the
// Firestore `products` collection is seeded. Firestore, when present, overrides
// this. KEEP PRICES IN SYNC WITH public/js/data.js.
const FALLBACK_PRODUCTS = {
  'el-triunfo': { name: 'El Triunfo', price: 79, originLabel: 'Colombia · Huila', image: 'assets/reference/packaging-colombia.jpg' },
  'el-cerro': { name: 'El Cerro', price: 85, originLabel: 'Costa Rica · West Valley', image: 'assets/reference/packaging-costarica.jpg' },
  'guji-uraga': { name: 'Guji Uraga', price: 89, originLabel: 'Ethiopia · Guji', image: 'assets/reference/packaging-ethiopia.jpg' },
  'masai-aa-top': { name: 'Masai AA Top', price: 95, originLabel: 'Kenya · Mount Kenya', image: 'assets/reference/packaging-kenya.jpg' },
  'simbi-kinazi': { name: 'Simbi Kinazi', price: 85, originLabel: 'Rwanda · Huye', image: 'assets/reference/packaging-blank-rwanda.jpg' },
};

async function resolveProduct(id) {
  const snap = await db.collection('products').doc(id).get();
  if (snap.exists) return snap.data();
  return FALLBACK_PRODUCTS[id] || null;
}

/* ------------------------------------------------------------ checkout */
exports.createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY], cors: true }, async (request) => {
  const data = request.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    throw new HttpsError('invalid-argument', 'Your cart is empty.');
  }

  // Derive the site origin from the success URL the client passed.
  let origin = '';
  try { origin = new URL(data.successUrl).origin; } catch (_) { /* left blank */ }

  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  const lineItems = [];

  for (const raw of items) {
    const id = String(raw.id || '');
    const qty = clampQty(raw.qty);
    if (!id) throw new HttpsError('invalid-argument', 'A cart item is missing its id.');

    const p = await resolveProduct(id);
    if (!p) {
      throw new HttpsError('not-found', `Product "${id}" is no longer available.`);
    }
    const price = Number(p.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new HttpsError('failed-precondition', `Product "${id}" has no valid price.`);
    }

    const images = [];
    if (p.image && origin) images.push(`${origin}/${String(p.image).replace(/^\//, '')}`);

    lineItems.push({
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.round(price * 100), // minor units (bani)
        product_data: {
          name: p.name || id,
          description: p.originLabel || undefined,
          images,
          metadata: { productId: id },
        },
      },
    });
  }

  const successUrl = (data.successUrl || `${origin}/success.html`) + '?session_id={CHECKOUT_SESSION_ID}';
  const cancelUrl = data.cancelUrl || `${origin}/cart.html`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: SHIP_COUNTRIES },
    metadata: { cart: JSON.stringify(items).slice(0, 480) },
  });

  logger.info('Checkout session created', { session: session.id, lines: lineItems.length });
  return { id: session.id, url: session.url };
});

/* ------------------------------------------------------------ webhook */
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const signature = req.headers['stripe-signature'];
    let event;
    try {
      // req.rawBody is provided by the Functions runtime and is required here.
      event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      logger.error('Webhook signature verification failed', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
        // Doc id = session id → replaying the event never double-writes an order.
        await db.collection('orders').doc(session.id).set(
          {
            sessionId: session.id,
            paymentIntent: session.payment_intent || null,
            email: session.customer_details?.email || null,
            name: session.customer_details?.name || null,
            phone: session.customer_details?.phone || null,
            shipping: session.shipping_details || session.collected_information?.shipping_details || null,
            amountTotal: session.amount_total, // minor units
            currency: session.currency,
            paymentStatus: session.payment_status,
            items: lineItems.data.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              amountTotal: li.amount_total,
            })),
            status: 'paid',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        logger.info('Order recorded', { session: session.id });
      } catch (err) {
        logger.error('Failed to record order', err.message);
        return res.status(500).send('Failed to record order');
      }
    }

    return res.json({ received: true });
  },
);
