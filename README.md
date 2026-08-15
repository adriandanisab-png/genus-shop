# Genus Coffee — shop & event booking

Marketing site, single-origin **shop** (Stripe checkout), and a **coffee-cart event-booking** flow for Genus Coffee, a Bucureşti specialty roaster.

Plain HTML + vanilla JS (ES modules, no build step) on **Firebase Hosting**, with **Firestore** for data and **Cloud Functions** for Stripe. Built to the [Genus Coffee Design System](#).

## Pages

| Page | File | What it does |
|------|------|--------------|
| Home | `public/index.html` | Hero, featured single-origins, events band |
| Shop | `public/shop.html` | Product grid with origin filter |
| Product | `public/product.html?id=…` | Single bag, quantity, add to cart |
| Events | `public/events.html` | Cart-hire packages + quote-request form → Firestore |
| Cart | `public/cart.html` | Line items → Stripe Checkout |
| Success / Cancel | `public/success.html`, `cancel.html` | Post-payment |
| Admin | `public/admin.html` | Google sign-in (allow-listed) → live orders & bookings |

## Data model (Firestore)

- **products** — catalog (public read; admin write). Optional: checkout has a server-side price fallback, so this can be empty at launch.
- **bookings** — event quote requests (public create; admin read/manage).
- **orders** — written by the Stripe webhook only (admin read).

## Architecture notes

- **No build step.** Pages are static HTML; each loads one ES module from `public/js/`. Shared chrome (nav/footer), cards, and the accordion are rendered by `js/components.js`; icons are inline SVG in `js/icons.js` (no icon CDN).
- **Demo mode.** Until you paste Firebase keys into `public/js/firebase.js`, the site runs fully on local data (`js/data.js`): browsing and cart work; checkout and booking submit show a friendly "not configured yet" notice instead of failing.
- **Price integrity.** The cart only ever sends `{id, qty}`. The `createCheckoutSession` Cloud Function looks up authoritative prices server-side — clients can't set prices.

## Local development

```bash
python3 -m http.server 5055 --directory public
# open http://localhost:5055
```

or, with the Firebase CLI installed: `firebase emulators:start`.

## Deploy

See **[SETUP.md](SETUP.md)** for the full walkthrough (Firebase project, Stripe keys, admin email, deploy commands).

```bash
firebase deploy
```
