// Genus Coffee — Stripe checkout kickoff. Sends only {id, qty} to the
// createCheckoutSession Cloud Function; the function looks up authoritative
// prices server-side (clients never set prices), creates a Stripe Checkout
// Session, and returns its URL for redirect.
import { IS_CONFIGURED, functions, httpsCallable } from './firebase.js';
import { getCart } from './cart.js';

export async function startCheckout(onError) {
  const items = getCart().map((i) => ({ id: i.id, qty: i.qty }));
  if (!items.length) return;

  if (!IS_CONFIGURED || !functions) {
    onError && onError('Payments aren’t connected yet. Add your Firebase + Stripe keys (see SETUP.md) to enable checkout.');
    return;
  }

  try {
    const callable = httpsCallable(functions, 'createCheckoutSession');
    const origin = location.origin;
    const res = await callable({
      items,
      successUrl: `${origin}/success.html`,
      cancelUrl: `${origin}/cart.html`,
    });
    const url = res && res.data && res.data.url;
    if (url) {
      location.assign(url);
    } else {
      onError && onError('Could not start checkout. Please try again.');
    }
  } catch (err) {
    console.error('[checkout] createCheckoutSession failed:', err);
    onError && onError(err.message || 'Checkout failed. Please try again.');
  }
}
