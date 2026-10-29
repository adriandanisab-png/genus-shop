# Web shop plan: Genus Coffee Box

**Build it into the existing Genus site, not as a new shop.** The site already has these pieces:
- Firebase Hosting and Firestore.
- A Cloudflare Worker that creates Stripe Checkout sessions for one-off payments (`mode: payment`) and subscriptions (`mode: subscription`).
- An admin with orders, subscriptions, discounts and products.

The box adds new plans, a quiz, a review page and a monthly line-up. There are no platform fees and nothing to migrate.

## Pages

| URL | Page | Main job | Key content |
|---|---|---|---|
| `/box` | Box home | Turn a visitor into a quiz-taker | Tagline, "how it works" in three steps, the 4 box cards, this month's line-up, roaster logos, review stars, FAQ |
| `/box/quiz` | Taste quiz | Pick the right box | 5 questions: brew method, roast preference, milk or black, how much coffee a week, adventurous or safe → recommends Duo or Trio and monthly or every 2 months |
| `/box/plan` | Choose and pay | Checkout | Box, frequency, subscription or one-off (+20 lei), delivery locker, the 199 lei first-box price → Stripe Checkout |
| `/box/gift` | Gift Trio | Gift sales, no subscription anywhere on the page | Gift box photos, note field, recipient address or locker, "order by 15 Dec" banner, 1 / 3 / 6-month prepaid |
| `/box/this-month` | This month's box | Show the coffees, build trust | The three coffees, their roasters and towns, roast dates, brew notes |
| `/box/review/:boxId` | Box review page | Collect ratings | Opened from the QR code on the card: 1–5 stars and flavour tags per coffee, a free-text note, "nominate your roaster" |
| `/box/ratings` | Public ranking | Proof and SEO | Average rating per coffee and roaster, best-rated this year |
| `/box/roasters` | Partner roasters | Credibility for partners | Profile per roaster: town, story, link to their shop |
| `/account` | My box | Self-service | Next delivery and line-up, swap a coffee, skip a month, change frequency, pause or cancel, past boxes and ratings, reorder a favourite |
| `/admin/box` | Admin: monthly cycle | Run operations | Set the month's line-up, count bags to order per roaster, packing list, review results |

## How checkout works (existing stack)

- **Subscriptions:** add the plans to the Worker's plan table (Duo 159, Trio 219, Reserve 259, each monthly or every 2 months). The Worker already sends `recurring[interval]`; use `interval_count: 2` for every 2 months. The 199 lei first box is a Stripe coupon applied to the first invoice (`duration: once`).
- **One-off and gift boxes:** add them as products (Duo 179, Trio 239, Gift Trio 259, Trial Trio 199) through the existing `mode: payment` basket flow.
- **Skip, swap, pause and cancel:** use the **Stripe Customer Portal** for pause, cancel and payment method (free, already supported by Stripe). Skip and swap are a Firestore flag that the admin reads at packing time; skip pauses billing for one cycle (`pause_collection`).
- **Webhook (new, needed):** a Worker endpoint for `checkout.session.completed`, `invoice.paid` and `customer.subscription.updated` that writes the subscriber, their plan and their status to Firestore. Today orders live only in Stripe, and the box needs a Firestore list of who gets a box this month.
- **Invoices:** connect SmartBill or Oblio to Stripe for e-Factura.

## Data (Firestore)

| Collection | Holds |
|---|---|
| `subscribers` | Stripe customer id, plan, frequency, status, locker, quiz answers (taste profile), skip/swap flags |
| `boxes` | Month, tier, the coffees in it (roaster, lot, roast date), card text |
| `coffees` | Each coffee: roaster, origin, process, roast level, brew method, tags |
| `ratings` | Subscriber, coffee, stars, flavour tags, note, date |
| `roasters` | Partner profiles, wholesale price, delivery terms |
| `nominations` | Roasters subscribers asked for |

**How picks are made (version 1, no AI needed):** for each subscriber, filter the month's coffees by brew method. Then favour roast levels and flavour tags they rated 4–5★, and avoid those they rated 1–2★. With 2–3 coffee options per month this is a simple sort. Do it by hand in the admin for the first 100 subscribers.

## Emails (Stripe and a transactional mail service, e.g. Brevo or MailerLite)

1. Welcome and quiz result.
2. Preview: 5 days before billing, with the line-up, roast dates, and swap / skip / cancel links.
3. Shipped: locker and AWB tracking.
4. Rate your box: 7 days after delivery, linking to the review page.
5. Gift: sent to the recipient on delivery, with the note.
6. Win-back: 30 days after a cancellation, "see what's in this month's box".

## Build order

| Step | Done by | What |
|---|---|---|
| 1 | 15 Nov 2026 | `/box/gift` with Gift Trio (one-off checkout, existing flow), real box photos |
| 2 | 18 Nov | `/box` home and waitlist form (Firestore), 199 lei founding first box |
| 3 | 10 Dec | Webhook and `subscribers` collection; plans and coupon in the Worker |
| 4 | 20 Dec | `/box/quiz` and `/box/plan`; Stripe Customer Portal |
| 5 | 28 Dec | `/box/review/:boxId` and `ratings`; QR codes on cards |
| 6 | 3 Jan 2027 | `/admin/box` (line-up, bag counts, packing list); preview email |
| 7 | 5 Jan | First subscription billing |
| 8 | Feb 2027 | `/box/ratings` public ranking, `/box/roasters`, reorder favourites, nominate a roaster |

## Measure from day one

Track these:
- Visits to `/box`.
- Quiz starts and completions.
- Checkout starts and paid orders.
- Subscription vs one-off vs gift mix.
- Skips and cancels per month.
- Review-page response rate.
- Average rating per coffee.

Use Plausible or GA4 with consent banner.
