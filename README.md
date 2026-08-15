# Genus Coffee — shop & event booking

Marketing site, single-origin **shop** (Stripe Payment Links), and a **coffee-cart event-booking** flow for Genus Coffee, a Bucureşti specialty roaster.

Plain HTML + vanilla JS (ES modules, no build step) on **Firebase Hosting**, with **Firestore** for event bookings. Runs entirely on the **free Spark plan** — no Cloud Functions, no billing. Built to the Genus Coffee Design System.

## Pages

| Page | File | What it does |
|------|------|--------------|
| Home | `public/index.html` | Hero, featured single-origins, events band |
| Shop | `public/shop.html` | Product grid with origin filter |
| Product | `public/product.html?id=…` | Single bag, add to cart, **Buy now** → Stripe |
| Events | `public/events.html` | Cart-hire packages + quote-request form → Firestore |
| Cart | `public/cart.html` | Saved bags; **Buy** each via its Stripe Payment Link |
| Success | `public/success.html` | Post-payment landing (Payment Link redirect target) |
| Admin | `public/admin.html` | Google sign-in (allow-listed) → live event bookings |

## Data model (Firestore)

- **products** — optional catalog (public read; admin write). The shop falls back to `js/data.js`, so this can stay empty.
- **bookings** — event quote requests (public create; admin read/manage).

Shop **orders** are handled by Stripe (Payment Links) and live in the **Stripe Dashboard**, not Firestore.

## Architecture notes

- **No build step, no backend.** Static HTML; each page loads one ES module from `public/js/`. Shared chrome (nav/footer), cards, and the accordion render from `js/components.js`; icons are inline SVG in `js/icons.js`.
- **Checkout = Stripe Payment Links.** Each product has a `stripeLink` in `js/data.js`; "Buy" opens Stripe's hosted page. No server, so it runs on the free plan — see `SETUP.md`.
- **Demo mode.** Until Firebase keys are present (they are, for `shop-genus-coffee`) and a `stripeLink` is set, the site runs on local data and shows friendly "not connected yet" notices instead of failing.

## Local development

```bash
python3 -m http.server 5055 --directory public
# open http://localhost:5055
```

## Deploy

See **[SETUP.md](SETUP.md)** (enable Firestore + Google auth, create Payment Links, deploy).

```bash
firebase deploy --only firestore:rules,hosting
```
