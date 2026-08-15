# Genus Coffee — shop & event booking

Marketing site, single-origin **shop** (whole-basket Stripe Checkout), and a **coffee-cart event-booking** flow for Genus Coffee, a Bucureşti specialty roaster.

Plain HTML + vanilla JS (ES modules, no build step) on **Firebase Hosting**, with **Firestore** for data and a **Cloud Function** for Stripe. Wired to Firebase project `shop-genus-coffee`. Built to the Genus Coffee Design System.

## Pages

| Page | File | What it does |
|------|------|--------------|
| Home | `public/index.html` | Hero, featured single-origins, events band |
| Shop | `public/shop.html` | Product grid with origin filter |
| Product | `public/product.html?id=…` | Single bag, quantity, add to cart |
| Events | `public/events.html` | Cart-hire packages + quote-request form → Firestore |
| Cart | `public/cart.html` | Whole basket → one Stripe Checkout |
| Success | `public/success.html` | Post-payment (cancel returns to the cart) |
| Admin | `public/admin.html` | Google sign-in (allow-listed) → live orders & bookings |

## Data model (Firestore)

- **products** — optional catalog (public read; admin write). The shop falls back to `js/data.js`, and checkout has a server-side price fallback, so this can stay empty.
- **bookings** — event quote requests (public create; admin read/manage).
- **orders** — written only by the Stripe webhook (admin read).

## Architecture notes

- **No build step.** Static HTML; each page loads one ES module from `public/js/`. Shared chrome, cards, and the accordion render from `js/components.js`; icons are inline SVG in `js/icons.js`.
- **Whole-basket checkout.** The cart's Checkout calls the `createCheckoutSession` Cloud Function with `{id, qty}` line items; the function looks up authoritative prices **server-side** (clients can't set prices), creates one Stripe Checkout Session for the whole basket, and redirects. The `stripeWebhook` function records paid orders into `orders`.
- **Region** `europe-west1` (functions + client), Firestore in Europe.

## Local development

```bash
python3 -m http.server 5055 --directory public
# open http://localhost:5055
```

## Deploy

See **[SETUP.md](SETUP.md)** (Blaze upgrade, Stripe secret + webhook, deploy). In short: `firebase deploy`.
