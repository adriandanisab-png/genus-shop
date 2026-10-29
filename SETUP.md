# Setup & deploy — Genus Coffee (Spark + Cloudflare Worker, no card)

The site is wired to Firebase project **`shop-genus-coffee`** (config, admin
allow-list). Firestore is enabled. Whole-basket checkout runs on a **Cloudflare
Worker** — free, no credit card, no Blaze. ~15 minutes.

Flow: cart → the Worker creates ONE Stripe Checkout Session for the whole basket
→ customer pays → back to the site.

## 0. Prerequisites

- **Firebase CLI** (already logged in as `orange10verde10@gmail.com` here)
- A free **Cloudflare account** (sign up at dash.cloudflare.com — no card)
- Your **Stripe secret key** — the same `sk_test_…` you used for the links
- Node 20+

## 1. One console toggle (no Blaze!)

- **Authentication → Sign-in method → Google → Enable** — only needed for `/admin`.

*(Firestore is already enabled ✓. Nothing else in Firebase.)*

## 2. Deploy the checkout Worker (Cloudflare)

```bash
cd ~/genus-coffee/worker

npx wrangler login                          # opens the browser, approve access
npx wrangler secret put STRIPE_SECRET_KEY   # paste sk_test_...  (stays on Cloudflare)
npx wrangler deploy
```

`deploy` prints the Worker URL, e.g.
`https://genus-checkout.<your-subdomain>.workers.dev`

Paste that URL into **`public/js/checkout.js`** → `CHECKOUT_ENDPOINT`:

```js
const CHECKOUT_ENDPOINT = 'https://genus-checkout.<your-subdomain>.workers.dev';
```

*(If your shop domain later isn't one of the three in `worker/src/index.js`
`ALLOWED_ORIGINS`, add it and `npx wrangler deploy` again.)*

## 3. Deploy the site (Firebase)

```bash
cd ~/genus-coffee
firebase deploy --only firestore:rules,hosting
```

Live at **https://shop-genus-coffee.web.app**. Test a whole-basket checkout with
card `4242 4242 4242 4242` (any future date / any CVC).

## Where things show up

- **Shop orders** → your **[Stripe Dashboard](https://dashboard.stripe.com/payments)** (the `/admin` "Shop orders" tab links there). No webhook, so orders aren't copied into Firestore.
- **Event bookings** → `/admin` (live from Firestore).

## Going live (real payments)

```bash
cd ~/genus-coffee/worker
npx wrangler secret put STRIPE_SECRET_KEY   # paste your LIVE sk_live_...
npx wrangler deploy
```
(No site redeploy needed unless the Worker URL changes.)

## If you later want orders inside /admin

That needs a webhook writing to Firestore — either a Firebase Function (Blaze) or
adding a webhook route to the Worker with a Firebase service account. Ask and I'll
wire it up.

## Common gotchas

- **Checkout says "not connected yet"** → `CHECKOUT_ENDPOINT` in `checkout.js` is still the placeholder.
- **Checkout error / CORS** → your site origin isn't in `ALLOWED_ORIGINS` in `worker/src/index.js`; add it and redeploy the Worker.
- **`/admin` says "no access"** → your Google email isn't in *both* `ADMIN_EMAILS` (js/firebase.js) and `firestore.rules`.

## Orders in /admin (Stripe webhook → Firestore)

So paid orders land in **/admin → Orders** (not just Stripe), the Worker records
them to Firestore on a webhook. One-time setup:

1. **Service account key**: Firebase console → Project settings → *Service accounts*
   → **Generate new private key**. From the JSON you need `client_email` and `private_key`.
2. **Give the Worker the secrets** (paste the `private_key` value exactly as it is in
   the JSON — one line with `\n` in it; the Worker converts it):
   ```bash
   cd ~/genus-coffee/worker
   npx wrangler secret put FIREBASE_CLIENT_EMAIL   # paste client_email
   npx wrangler secret put FIREBASE_PRIVATE_KEY    # paste the private_key value
   ```
3. **Stripe webhook**: Dashboard → Developers → Webhooks → **Add endpoint**:
   - URL = `https://genus-checkout.genus-coffee-oradea.workers.dev/webhook`
   - Event = **`checkout.session.completed`**
   - Reveal the signing secret (`whsec_…`), then:
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET   # paste whsec_...
   npx wrangler deploy
   ```
4. **Deploy the rules**: `firebase deploy --only firestore:rules`

Now every completed checkout (one-off or subscription) writes an `orders/<sessionId>`
doc, and /admin → Orders reads it. (Idempotent — Stripe retries are de-duped by id.)

## Genus Coffee Box (`/box`) — go-live checklist

Spec: `handoff/README.md`, data contract: `handoff/docs/box-data.md`.

1. **Worker** (plans, box checkout, account, review credit, subscriber webhook):
   `cd worker && npx wrangler deploy` — existing routes are unchanged.
2. **Firestore rules** (new box collections): `firebase deploy --only firestore:rules`
3. **Stripe Dashboard**
   - Webhook endpoint `…/webhook`: add events `customer.subscription.updated`,
     `customer.subscription.deleted` and `invoice.paid` (keep `checkout.session.completed`).
   - Settings → Billing → **Customer portal**: activate it (pause, cancel, payment method, invoices).
   - The founding coupon `box-founding-trio` (−20 lei, once) is created automatically on the first Trio checkout.
4. **Firebase console** → Authentication → Sign-in method → **Email/Password → Email link** on (for `/account`).
5. **Preview first**: `firebase hosting:channel:deploy box --expires 14d`, test, then
   `firebase deploy --only hosting` to go live.
6. In `/admin → Box`: add coffees, roasters (tick "Signed & agreed" only after they agree), and publish the month's line-up.

Open before launch (from the handoff): legal check of the terms and the 25 lei guarantee (ANPC), real box photos, locker picker (v1 is a manual field), min ratings for the ranking (set to 10 in `js/box/shared.js`).
