# Box data contract (Firestore + Worker)

Shared by every /box page, /account and the admin Box tab. Firestore reads/writes go
through `public/js/firebase.js` (SDK re-exports). Worker calls go through
`public/js/box/shared.js` (`getPlans`, `startBoxCheckout`, `userFetch`).

## Collections

| Path | Fields | Who reads / writes |
|---|---|---|
| `boxes/{YYYY-MM}` | `month`, `theme`, `intro`, `billingDate`, `roastDate`, `deliveryDate`, `announceDate` (ISO dates), `published` (bool), `coffees: [{coffeeId, slot: 'INVITAT 1'\|'INVITAT 2'\|'CASA', tiers: ['duo','trio','reserve']}]`, `alternates: {coffeeId: altCoffeeId}` | public read (only `published` ones are shown); admin write |
| `coffees/{id}` | `name`, `roasterId`, `roasterName`, `city`, `origin`, `process`, `altitude`, `roastLevel`, `roastDate`, `notes` (string[]), `goodFor`, `methods` (['filtru','espresso']), `tier` ('duo'\|'trio'\|'reserve' colour), `retailPrice`, `bagPrice` | public read; admin write |
| `roasters/{id}` | `name`, `city`, `story`, `logo`, `shopUrl`, `monthsFeatured` (string[]), `public` (bool) | public read **only where `public == true`** (query must filter on it); admin all |
| `subscribers/{stripeCustomerId}` | `email` (lowercase), `name`, `phone`, `customerId`, `subscriptionId`, `plan`, `intervalCount`, `status` (Stripe status, plus `paused`), `locker`, `tasteProfile` (quiz answers), `reviewToken`, `currentPeriodEnd` (unix), `swaps: {YYYY-MM: {coffeeId: altCoffeeId}}`, `skipMonths` (string[]) | Worker webhook writes; owner (auth email == `email`) reads and may update only `swaps`, `locker`; admin all |
| `reviewTokens/{token}` | `subscriberId`, `email` | `get` public (token is the secret); Worker writes |
| `ratings/{boxId}_{token}_{coffeeId}` | `boxId`, `coffeeId`, `token`, `subscriberId`, `email` (copied from reviewTokens), `stars` (1–5), `tags` (string[]), `note`, `createdAt` | create/update with a valid token; `get` public by id; `list` by owner (`where('email','==',…)`) or admin |
| `rankings/{coffeeId}` | `kind: 'coffee'`, `coffeeName`, `roasterName`, `city`, `notes`, `methods`, `avg`, `count` | public read; admin writes (the admin "Recompute ranking" button aggregates `ratings`) |
| `nominations/{auto}` | `roaster`, `city`, `note`, `source` ('review'\|'roasters'), `createdAt` | public create; admin read |
| `waitlist/{auto}` | `email`, `source`, `createdAt` | public create; admin read |
| `credits/{subscriberId}_{boxId}` | `amount`, `coffeeId`, `createdAt` | Worker writes; admin reads |

Gift and one-off box orders land in `orders/{sessionId}` (existing) with `metadata` (box, locker, gift recipient, note).

## Worker routes (worker/src/index.js)

| Route | Auth | Body → response |
|---|---|---|
| `GET /plans` | public | plan table (see `getPlans` in shared.js) |
| `POST /subscribe` | public | `{plan, interval_count, coupon?, customer, tasteProfile?}` → `{url}` |
| `POST /` | public | `{items:[{id,qty}], customer?, gift?}` → `{url}` (box ids: `box-duo`, `box-trio`, `box-gift-1/3/6`) |
| `POST /review/credit` | token | `{token, boxId, coffeeId}` → `{credited: bool}` (25 lei once per box, only if that rating is 1–2★) |
| `POST /account/portal` | user | → `{url}` Stripe Customer Portal |
| `POST /account/skip` | user | → `{ok}` pause_collection for the next cycle |
| `POST /account/change` | user | `{plan, interval_count}` → `{ok}` (next cycle, no proration) |
| `POST /account/reactivate` | user | → `{ok}` |
| `GET /account/subscription` | user | → `{subscription: {status, plan, intervalCount, currentPeriodEnd, pauseResumesAt, cancelAtPeriodEnd}}` |

"user" = Firebase ID token of a signed-in customer (email-link sign-in); the Worker
matches it to the Stripe customer by email.
