# Genus Coffee — shop & event booking

Marketing site, single-origin **shop** (whole-basket Stripe Checkout), and a **coffee-cart event-booking** flow for Genus Coffee, a Bucureşti specialty roaster.

Plain HTML + vanilla JS (ES modules, no build step) on **Firebase Hosting** (free Spark plan), with **Firestore** for bookings and a **Cloudflare Worker** for Stripe checkout — no Blaze, no billing. Wired to Firebase project `shop-genus-coffee`.

## Pages

| Page | File | What it does |
|------|------|--------------|
| Home | `public/index.html` | Hero, featured single-origins, events band |
| Shop | `public/shop.html` | Product grid with origin filter |
| Product | `public/product.html?id=…` | Single bag, quantity, add to cart |
| Events | `public/events.html` | Cart-hire packages + quote-request form → Firestore |
| Cart | `public/cart.html` | Whole basket → one Stripe Checkout |
| Success | `public/success.html` | Post-payment (cancel returns to the cart) |
| Admin | `public/admin.html` | Google sign-in (allow-listed) → event bookings |

## Data model (Firestore)

- **products** — optional catalog (public read; admin write). The shop falls back to `js/data.js`, so this can stay empty.
- **bookings** — event quote requests (public create; admin read/manage).

Shop **orders** are handled by Stripe and live in the **Stripe Dashboard** (no webhook writing to Firestore in this setup).

## Architecture notes

- **No build step, no Blaze.** Static HTML; each page loads one ES module from `public/js/`. Shared chrome, cards, and the accordion render from `js/components.js`; icons are inline SVG in `js/icons.js`.
- **Whole-basket checkout on Cloudflare.** The cart's Checkout POSTs `{id, qty}` line items to the Worker in `worker/`, which looks up authoritative prices **server-side** (browser never sets prices), creates one Stripe Checkout Session for the entire basket, and returns its URL. Free Cloudflare Workers plan, Stripe secret held as a Worker secret.
- **Everything else on Firebase Spark** — Hosting + Firestore (bookings) + Google-auth admin. Firestore in Europe (europe-west1).

## Local development

```bash
python3 -m http.server 5055 --directory public
# open http://localhost:5055
```

## Deploy

See **[SETUP.md](SETUP.md)** — deploy the Cloudflare Worker, paste its URL into `js/checkout.js`, then `firebase deploy --only firestore:rules,hosting`.
