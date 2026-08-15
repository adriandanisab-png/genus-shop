# Setup & deploy — Genus Coffee (Spark / free plan)

The site is already wired to your Firebase project **`shop-genus-coffee`**. No billing/Blaze is required — the shop checks out via **Stripe Payment Links**, and event bookings save to Firestore (free tier). ~15 minutes to go live.

## 0. Prerequisites

- **Firebase CLI**: `npm install -g firebase-tools` then `firebase login` (already logged in as `orange10verde10@gmail.com` on this machine)
- A **Stripe account** (test mode is fine to start)
- Node.js 20+ (only needed for the optional product seed)

## 1. Enable two services in the [Firebase console](https://console.firebase.google.com/project/shop-genus-coffee)

1. **Firestore Database → Create database → production mode → location `europe-west1`** (or the `eur3` multi-region). ⚠️ Permanent — pick Europe. Powers the event-booking inbox.
2. **Authentication → Sign-in method → Google → Enable.** Lets you (and only allow-listed emails) into `/admin`.

That's it — **no Blaze plan needed.**

> Already set for you: Firebase config, project id, and the admin allow-list
> (`adrian.danisab@gmail.com`, `orange10verde10@gmail.com`) in `public/js/firebase.js`
> and `firestore.rules`. Edit those two (keep them in sync) to change admins.

## 2. Create the shop's Stripe Payment Links

In **Stripe Dashboard → Payment Links → + New link**, create **one link per bag** (5 total). For each:

- **Product**: name it to match, set the price in **RON** (matching `public/js/data.js`):
  El Triunfo 79 · El Cerro 85 · Guji Uraga 89 · Masai AA Top 95 · Simbi Kinazi 85 lei
- Turn on **"Let customers adjust quantity"**
- Turn on **Collect shipping address** (Romania)
- *(Optional, nicer UX)* After payment → **Redirect to your page** →
  `https://shop-genus-coffee.web.app/success.html?id=<productId>`
  where `<productId>` is the `id` in data.js (`el-triunfo`, `el-cerro`, `guji-uraga`, `masai-aa-top`, `simbi-kinazi`). The `?id=` lets the site drop that bag from the cart on return.

Copy each link's URL into the matching product's **`stripeLink`** in `public/js/data.js`:

```js
{ id: 'el-triunfo', …, stripeLink: 'https://buy.stripe.com/xxxxxxxx' },
```

Until a `stripeLink` is filled, that product's **Buy** button shows a "not connected yet" notice.

## 3. Deploy

```bash
cd ~/genus-coffee
firebase deploy --only firestore:rules,hosting
```

Live at **https://shop-genus-coffee.web.app**. Sign in at `/admin.html` with an allow-listed Google account to see event bookings.

## 4. (Optional) Seed the product catalog into Firestore

The shop reads from `public/js/data.js` by default, so this is optional — do it only if you want to manage the catalog from Firestore later:

```bash
cd ~/genus-coffee/scripts
npm install
gcloud auth application-default login     # or export GOOGLE_APPLICATION_CREDENTIALS=…serviceAccount.json
node seed-products.js shop-genus-coffee
```

## Where orders show up

Payment Links are hosted by Stripe, so **orders live in your [Stripe Dashboard](https://dashboard.stripe.com/payments)** (customer, items, shipping, payment status). The `/admin` "Shop orders" tab links straight there. Event **bookings** are in `/admin` (from Firestore).

## Going live (real payments)

1. Recreate the 5 Payment Links in Stripe **live mode** (or toggle the account live).
2. Replace the `stripeLink` URLs in `data.js` with the live `https://buy.stripe.com/…` links.
3. `firebase deploy --only hosting`.

## If you outgrow Payment Links

Want a true multi-item cart (pay for several bags at once) with orders auto-recorded into `/admin`? That needs a small backend, which on Firebase means **Cloud Functions + the Blaze plan**. Say the word and I'll add it back (the earlier function code is in git history).

## Common gotchas

- **"Buy" shows "not connected yet"** → that product's `stripeLink` is still empty in `data.js`.
- **Booking form errors** → Firestore isn't enabled yet (step 1), or rules aren't deployed (step 3).
- **`/admin` says "no access"** → your Google email isn't in *both* `ADMIN_EMAILS` and `firestore.rules`.
