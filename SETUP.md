# Setup & deploy — Genus Coffee

The site is wired to your Firebase project **`shop-genus-coffee`** (config, admin
allow-list, region `europe-west1`). Firestore is enabled. What's left is to turn
on Cloud Functions (Blaze), give Stripe its keys, and deploy. ~15 minutes.

Checkout is **whole-basket**: the cart calls the `createCheckoutSession` Cloud
Function, which builds one Stripe Checkout Session for every item at once.

## 0. Prerequisites

- **Firebase CLI** (already logged in as `orange10verde10@gmail.com` on this machine)
- Your **Stripe secret key** — the same `sk_test_…` you used to make the Payment Links (Dashboard → Developers → API keys). *(The old Payment Links are no longer used and can be archived in Stripe.)*
- Node 20+ (for `functions/` install)

## 1. Two things in the console

1. **Upgrade the project to the [Blaze plan](https://console.firebase.google.com/project/shop-genus-coffee/usage/details)** — Cloud Functions require it. Realistically ~€0/mo at your volume; set a budget alert if you like.
2. **Authentication → Sign-in method → Google → Enable** (only needed for `/admin`).

*(Firestore is already enabled — ✓.)*

## 2. Stripe key + deploy the functions

```bash
cd ~/genus-coffee/functions
npm install

# your Stripe secret key
firebase functions:secrets:set STRIPE_SECRET_KEY        # paste sk_test_...

# deploy so the webhook URL exists
firebase deploy --only functions
```

The deploy prints the **stripeWebhook** URL, e.g.
`https://europe-west1-shop-genus-coffee.cloudfunctions.net/stripeWebhook`

## 3. Point Stripe's webhook at it

In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
- URL = that `stripeWebhook` URL
- Event = **`checkout.session.completed`**
- Save, **Reveal** the signing secret (`whsec_…`), then:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # paste whsec_...
firebase deploy --only functions:stripeWebhook
```

## 4. Deploy rules + site

```bash
cd ~/genus-coffee
firebase deploy --only firestore:rules,hosting
```

Live at **https://shop-genus-coffee.web.app**. Test a basket checkout with card
`4242 4242 4242 4242` (any future date / any CVC); the order should appear in
`/admin` → Orders, and in your Stripe Dashboard.

## 5. (Optional) Seed the catalog into Firestore

Not required — the shop reads `js/data.js` and checkout has a server-side price
fallback. Do it only to manage the catalog from Firestore later:

```bash
cd ~/genus-coffee/scripts && npm install
gcloud auth application-default login
node seed-products.js shop-genus-coffee
```

## Going live (real payments)

1. Set `STRIPE_SECRET_KEY` to your **live** `sk_live_…` and redeploy functions.
2. Add a **live-mode** webhook endpoint (same URL + event), set `STRIPE_WEBHOOK_SECRET` to its `whsec_…`, redeploy `stripeWebhook`.

## Common gotchas

- **Functions won't deploy** → project isn't on Blaze yet (step 1).
- **Checkout button errors** → `STRIPE_SECRET_KEY` not set, or functions not deployed.
- **Webhook 400s in Stripe** → `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint; reset and redeploy `stripeWebhook`.
- **`/admin` says "no access"** → your Google email isn't in *both* `ADMIN_EMAILS` (js/firebase.js) and `firestore.rules`.
