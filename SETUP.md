# Setup & deploy — Genus Coffee

Everything is built. To go live you need to (1) create a Firebase project, (2) paste keys into a few files, (3) wire Stripe, (4) deploy. ~20 minutes.

## 0. Prerequisites

- **Node.js 20+**
- **Firebase CLI**: `npm install -g firebase-tools` then `firebase login`
- A **Firebase project** on the **Blaze (pay-as-you-go)** plan — Cloud Functions require Blaze. (Costs are ~zero at low volume.)
- A **Stripe account** (test mode is fine to start).

In the [Firebase console](https://console.firebase.google.com), on your project, enable:
- **Build → Firestore Database** (create database, production mode)
- **Build → Authentication → Sign-in method → Google** (enable)
- **Build → Hosting** and **Build → Functions**

---

## 1. Paste your keys (4 edits)

### a) `public/js/firebase.js`
- **`firebaseConfig`** — copy from Firebase console → Project settings → *Your apps* → Web app → SDK setup & config. Replace every `REPLACE_…`.
- **`ADMIN_EMAILS`** — the Google account(s) allowed into `/admin`.
- `FUNCTIONS_REGION` — set to `europe-west1` (matches the functions). Create **Firestore in a European location too** (e.g. `europe-west1` or the `eur3` multi-region) — Firestore's location is permanent.

### b) `.firebaserc`
Replace `REPLACE_WITH_PROJECT_ID` with your Firebase project id. (Or run `firebase use --add`.)

### c) `firestore.rules`
Replace `REPLACE_WITH_ADMIN_EMAIL@example.com` with the **same** admin email(s) as `ADMIN_EMAILS`. This is the real security boundary for the admin data.

> Currency is **RON (lei)**, set in `public/js/data.js` (`CURRENCY`) and `functions/index.js` (`CURRENCY`). Change both if you sell in EUR/USD.

---

## 2. Wire Stripe (functions)

```bash
cd functions
npm install

# 1) your Stripe secret key (Dashboard → Developers → API keys)
firebase functions:secrets:set STRIPE_SECRET_KEY      # paste sk_test_...

# 2) deploy the functions so the webhook URL exists
firebase deploy --only functions
```

The deploy prints the **stripeWebhook** URL, e.g.
`https://europe-west1-<project>.cloudfunctions.net/stripeWebhook`

In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
- Endpoint URL = that stripeWebhook URL
- Events to send = **`checkout.session.completed`**
- Save, then **Reveal** the *Signing secret* (`whsec_...`)

```bash
# 3) store the signing secret and redeploy the webhook to pick it up
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # paste whsec_...
firebase deploy --only functions:stripeWebhook
```

---

## 3. Deploy rules + site

```bash
firebase deploy --only firestore:rules
firebase deploy --only hosting
# or everything at once:
firebase deploy
```

Your site is live at `https://<project>.web.app`. Sign in at `/admin.html` with an allow-listed Google account.

---

## 4. (Optional) Seed the product catalog into Firestore

Checkout already works via a server-side price fallback in `functions/index.js`. Seed Firestore only if you want the catalog stored there (to edit later):

```bash
cd scripts
npm install
gcloud auth application-default login     # or export GOOGLE_APPLICATION_CREDENTIALS=…serviceAccount.json
node seed-products.js <your-project-id>
```

---

## Going to production with Stripe

1. Toggle Stripe to **live mode**, grab the live `sk_live_…` key and set `STRIPE_SECRET_KEY` again.
2. Create a **live** webhook endpoint (same URL, same event) and set `STRIPE_WEBHOOK_SECRET` to its `whsec_…`.
3. `firebase deploy --only functions`.

## Where things live

```
public/            → Firebase Hosting (the site)
  js/firebase.js   → your Firebase config + admin allow-list  ← EDIT
  js/data.js       → catalog, prices, packages, FAQ, currency ← EDIT copy
functions/index.js → Stripe checkout + order webhook
firestore.rules    → security (admin email)                  ← EDIT
.firebaserc        → project id                              ← EDIT
```

## Common gotchas

- **Checkout says "not connected"** → `firebaseConfig` still has `REPLACE_…` values.
- **`/admin` says "no access"** → the signed-in email isn't in *both* `ADMIN_EMAILS` and `firestore.rules`.
- **Webhook 400s in Stripe** → `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint; reset it and redeploy `stripeWebhook`.
- **Functions won't deploy** → project isn't on the Blaze plan.
