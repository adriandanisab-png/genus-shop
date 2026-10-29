// Genus Coffee — whole-basket checkout via the Cloudflare Worker (see worker/).
// Sends only {id, qty}; the Worker resolves prices server-side, creates ONE
// Stripe Checkout Session for the whole cart, and returns its URL.
import { getCart } from './cart.js';

// After deploying the Worker, paste its URL here (…workers.dev or your domain).
const CHECKOUT_ENDPOINT = 'https://genus-checkout.genus-coffee-oradea.workers.dev';

export async function startCheckout(onError) {
  const items = getCart().map((i) => ({ id: i.id, qty: i.qty }));
  if (!items.length) return;

  if (!CHECKOUT_ENDPOINT || CHECKOUT_ENDPOINT.startsWith('REPLACE')) {
    onError && onError('Payments aren’t connected yet. Deploy the checkout Worker and set its URL (see SETUP.md).');
    return;
  }

  try {
    const origin = location.origin;
    const res = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, successUrl: `${origin}/success.html`, cancelUrl: `${origin}/cart.html` }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      location.assign(data.url);
    } else {
      onError && onError(data.error || 'Could not start checkout. Please try again.');
    }
  } catch (err) {
    console.error('[checkout] failed:', err);
    onError && onError(err.message || 'Checkout failed. Please try again.');
  }
}
