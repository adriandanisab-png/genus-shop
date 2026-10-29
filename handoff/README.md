# Handoff: Genus Coffee Box (`/box`)

A monthly box of Romanian specialty coffee, sold from the existing Genus site. This folder holds everything needed to build it: the designs, the assets, a CSS add-on and this spec.

- **Live design canvas:** https://claude.ai/artifact/M9cruDWWyFwyqPBWaFbgQP. It has 15 boards, the quiz, plan, gift and review pages are clickable (Play button), and you can comment on any element. It is private until the owner shares it.
- **Business context:**
  - `docs/webshop.md`: pages, Stripe, data model, build order
  - `docs/pricing.md`: prices and plans
  - `docs/offer.md`: the promises the UI must keep
  - `docs/brand.md`: name, voice, colour rules

## What's in this folder

| Path | What |
|---|---|
| `designs/*.dc.html` | One HTML file per board. Open in a browser for exact markup, copy and inline styles. They need the canvas runtime to render the `{{…}}` bindings, so use the canvas link to see them rendered. |
| `designs/canvas.json` | Board list, sizes and layout of the canvas |
| `box.css` | CSS add-on for the box pages. Load it after `public/styles/app.css` |
| `assets/seals/seal-{duo,trio,reserve,gift}.svg` | The box seal per tier (240×240) |
| `assets/seals/favicon.svg` | 32px seal for the `/box` favicon |
| `assets/images/packaging-studio-angle.jpg` | Genus bag photo (home hero, "box of the month") |
| `assets/images/illustration-harvester-circle.jpg` | Linocut illustration (brand board, cards) |
| `docs/` | Brand, offer, pricing and web shop plan |

**Missing assets (to produce):**
- Real photos of the open box, each box tier and the gift box. The designs use CSS drawings for now.
- Roaster logos.
- The final seal, redrawn by a designer. The SVGs are concepts, and their text uses live fonts: outline the text before sending to print.

## Stack and where it goes

Build into the existing site: plain HTML and ES modules, Firebase Hosting, Firestore, and Stripe through the Cloudflare Worker (`worker/src/index.js`). There is no build step.
- **New pages:** `public/box/index.html` (home), `quiz.html`, `plan.html`, `gift.html`, `this-month.html`, `review.html`, `ratings.html`, `roasters.html`, `public/account.html`.
- **Admin:** a new "Box" tab in `public/admin.html`.
- **Scripts:** one module per page in `public/js/box/`.
- **Shared header:** reuse `js/components.js`. The box header is the existing nav plus the ticker, with "BOX" as a pink sticker next to the GENUS wordmark.

## Design tokens

Everything maps to existing tokens in `public/styles/tokens.css`, plus the few that `box.css` adds. Use tokens, not hex values.

| Token | Value | Use |
|---|---|---|
| `--ink-950` | #17130D | Text, borders, shadows, dark sections, the box itself |
| `--paper-50` | #FDF7EA | Page background, cards on bands |
| `--paper-100` | #FFFFFF | Cards, inputs |
| `--red` / `--tier-trio` | #FF5140 | Primary buttons, Trio, seal ring |
| `--gold` / `--tier-reserve` | #F5A623 | Secondary buttons, Reserve, gift banner, account pill |
| `--pink` / `--tier-gift` | #FF7FB0 | Stickers, "how it works" band, Gift |
| `--green` / `--tier-duo` | #17A05B | Duo, success |
| `--blue` | #3F74FF | Focus ring and shapes only, never text |
| `--tan-300` | #D9C3A0 | Kraft (inside the box), muted text on dark |
| `--border-w` | 2.5px | Every card, button, input and band edge |
| `--shadow-sm` / `--shadow-card` / `--shadow-md` | 3 / 4 / 6px hard ink | Buttons / cards / hover and big images |
| `--radius-md` / `--radius-full` | 18px / 999px | Cards / buttons, stickers, chips |
| `--font-display` | Space Grotesk 700, UPPERCASE, +0.03–0.08em | Headings, buttons, labels |
| `--font-body` | Instrument Sans 400–600 | Body text |
| `--font-mono` | IBM Plex Mono | Prices, roast dates, altitudes, ratings |

**Contrast rule:** text on red, gold, pink and green is always `--ink-950` (6:1 or better). White text on `--red` is only 3.2:1, so `box.css` switches `.btn--primary` text to ink. This is a deliberate change from the live shop.

## Components (`box.css` plus existing `app.css`)

| Component | Class | Variants / props | Notes |
|---|---|---|---|
| Ticker | `.ticker` (exists) | — | Box copy: "3 prăjitorii românești ● Livrare gratuită la easybox ● Prăjit acum max. 7 zile ● Prima cutie 199 lei". Pause on hover and for reduced motion. |
| Button | `.btn` (exists) | `--primary` red, `--inverse` gold, `--secondary` cream | Pill, ink border and shadow. Hover moves it −1px with a 6px shadow; active moves it +1px with a 1px shadow. |
| Sticker | `.sticker` | `--gold`, `--green`, `--cream`, `--right` (tilted the other way) | Decoration only. Never the only place key information appears. |
| Box card | `.box-card` | `--duo`, `--trio`, `--reserve`, `--gift` | Media area shows that tier's seal SVG. Pick buttons link to `/box/plan?box=…`. |
| Option card | `.opt-card` | selected through `aria-pressed` or a checked radio | Quiz answers, plan box picker |
| Segmented pills | `.seg` / `.seg__item` | `aria-pressed` | Frequency, gift duration, ranking filters |
| Progress | `.progress` / `.progress__bar` | width % | Quiz |
| Order summary | `.summary` | — | Sticky on desktop, static below 860px |
| Stars | `.stars` | radio group 1–5 | Review page, 48px targets |
| Chip | `.chip` | `aria-pressed` | Flavour tags |
| Bands | `.band--pink`, `.band--gold` | — | Full-width sections with top and bottom ink borders |
| Step card | `.step` | the 2nd card tilts −1° | "Cum merge" |
| Seal | `assets/seals/*.svg` | duo, trio, reserve, gift | Use as an `<img>` with the alt text "Cutia Trio, 3 prăjitorii" etc. |

## Pages

The canvas board for each page is in brackets. Prices come from `docs/pricing.md`. **Read prices from the Worker's plan table, never from front-end constants** (the existing rule: the browser never sets prices).

### 1. Home `/box` [Home]

**Sections, in order:**
1. Ticker and nav.
2. Dark hero: pink sticker, H1 "CAFEA BUNĂ, FĂRĂ BĂTĂI DE CAP.", one paragraph, two buttons ("FĂ QUIZ-UL →" in red, "TRIMITE CADOU" in gold), and the 199 lei note.
3. "ALEGE-ȚI CUTIA": 4 box cards.
4. Pink band "CUM MERGE": 3 step cards.
5. "Cutia lunii": bag photo plus this month's theme and roasters, pulled from Firestore `boxes/{current}`.
6. Footer with the Termeni, ANPC and SOL links (legally required).

**States:**
- No current box published: hide "Cutia lunii", or show "Cutia de [luna] se anunță pe [data]".
- Founding offer: the 199 lei note disappears after 31 Jan 2027. Drive this by a date in config, not by editing copy.

### 2. Quiz `/box/quiz` [Quiz, clickable]

**Five questions, one per screen:**
1. Method: V60 / filtru, Espresso, AeroPress, Moka.
2. Taste: fructat, echilibrat, ciocolatos, nu știu.
3. Milk: neagră, cu lapte, și, și.
4. Amount per week: 1–4, 5–10, 10+.
5. Style: surprinde-mă, pe gustul meu, mix.

**Layout:** options are `.opt-card` buttons in a responsive grid, with "Înapoi" and "Înainte". The right column, "PROFILUL TĂU", fills in live as the user answers.

**Result:** 1–4 cups a week gives Duo every 2 months; otherwise Trio monthly. The "Continuă cu …" button goes to `/box/plan?box=…&freq=…`.

**Persistence:** answers go to `localStorage` until checkout, then to `subscribers.tasteProfile`.

**States and edge cases:**
- "Înainte" is disabled until an option is chosen.
- Back keeps earlier answers.
- Refreshing the page resumes from `localStorage`.

**Accessibility:**
- Each question is an `<h1>`; the options are a group labelled by that question.
- Move focus to the question heading when the step changes.
- The progress bar has `role="progressbar"` with `aria-valuenow`.

### 3. Choose and pay `/box/plan` [Plan, clickable]

**Steps:**
1. Box: Duo, Trio or Reserve (option cards).
2. Frequency pills: Lunar, La 2 luni, O singură dată. Reserve has no one-off option, so hide that pill.
3. Delivery: name, easybox or FAN locker (search field, through the Sameday locker API or a manual field in v1), email, phone.

**Summary card:**
- Shows box · frequency · price.
- For Trio, shows "−X lei" for the first box (199 lei total), with free delivery.
- "Plătești azi" shows the total, and a line explains what happens next.
- One-off orders say "Nu te înscriem în niciun abonament."

**Pay button:**
- Subscription: POST to the Worker `/subscribe` with `{plan, interval_count, coupon}`.
- One-off: POST to the existing `/checkout` with `{id, qty}`.
- Either way, the response redirects to Stripe Checkout.

**States:**
- The pay button shows a loading spinner and is disabled while the Worker responds.
- Worker error: a `.notice` above the button reading "Plata nu a pornit, încearcă din nou", with the button re-enabled.
- Invalid fields: an inline message under each field. Locker is required.

**Responsive:** below 860px the summary moves under the form.

### 4. Gift `/box/gift` [Gift, clickable]

**Layout:**
- Gold banner: "COMANDĂ PÂNĂ PE 15 DECEMBRIE…". Show it 1 Nov–15 Dec only; after the 15th switch the copy to "livrare după sărbători".
- Pink panel: the gift box drawing. Replace it with a real photo once one exists.
- Duration pills: 1 cutie 259, 3 luni 639, 6 luni 1249 lei.
- Fields: recipient name, address or easybox, and a note limited to 200 characters with a live counter.

**Rules:**
- Always a one-off Stripe payment, never a subscription, including the 3- and 6-month options (prepaid; the admin ships them monthly).
- **No subscription upsell anywhere in the gift flow.** The panel buyers asked for this.
- The packing slip never shows a price.

**Edge cases:**
- Note: emoji are allowed, but strip anything that won't print. Over 200 characters is blocked by the counter.

### 5. This month `/box/this-month` [ThisMonth]

**Content:**
- Dark header: month, theme, intro text, roast and delivery dates.
- Three coffee cards: tier-coloured media, the tag (INVITAT 1 · CITY / CASA · ORADEA), name, roaster, a spec box (origin, process, altitude, roast date), tasting notes and "bună pentru".
- Two calls to action: swap (go to account) and buy.

**Data:** all from `boxes/{month}` and `coffees`.

**States:**
- Before the line-up is final: "Line-up-ul se anunță pe [data]".
- A coffee field is missing: hide that row of the spec box, never show "undefined".

### 6. Review `/box/review?b={boxId}&t={token}` [Review, phone, clickable]

**How it opens:** from the QR code on the card. The token identifies the subscriber with no login.

**Per coffee:**
- 1–5 stars (radio group).
- Flavour chips: Fructat, Ciocolatos, Floral, Dulce, Acid, Amar.
- A rating of 1–2★ shows "Ne pare rău… 25 lei reducere" and creates a credit: a Stripe customer balance or a coupon on the next invoice, one per box.

**Optional fields:** a free-text note, and "Ce prăjitorie vrei să vezi în cutie?", which goes to `nominations`.

**Submit:** writes `ratings` and shows "Mulțumim!".

**States:**
- Already rated: prefill the answers, and submitting updates them.
- Invalid or expired token: "Linkul a expirat, intră în cont".
- Offline: keep the input and retry.

**Design:** mobile-first at a 390px reference width. Every touch target is at least 44px.

### 7. Ranking `/box/ratings` [Ratings]

**Table columns:** rank, coffee, roaster · city, notes, average ★, number of ratings.

**Filters:** Cafele / Prăjitorii / Filtru / Espresso pills.

**Rules:**
- A coffee appears only after **N** ratings. The value of N is open: suggest 10.
- Only ratings from people who received the coffee count. Say so in the "Cum calculăm" box.
- Below N ratings show "★ în curând". Never fake numbers.

**Responsive:** the table scrolls sideways inside its box on mobile.

### 8. Roasters `/box/roasters` [Roasters]

**Content:**
- Cards: initial avatar (or logo when there is one), name, city, a 2-line story, months featured, a "Magazinul lor →" link (external, `rel="noopener"`).
- An "Aplică ca partener" block for roasters.
- A "Nominalizează" form that writes to `nominations`.

**Rule:** only show roasters with `roasters.public === true`, meaning they have signed and agreed.

### 9. My account `/account` [Account]

**Sign-in:** reuse the Firebase Auth email link, matched to the Stripe customer through the webhook.

**Next box:**
- Delivery date and payment date.
- "Poți schimba până pe [date]": the swap deadline is 5 days before billing.
- Three coffees, each with "Schimbă", which swaps to the month's alternate coffee.
- Buttons: "Sari peste luna aceasta" (Stripe `pause_collection` for one cycle) and change easybox.

**Subscription panel:**
- Box and frequency selects: Stripe subscription update with proration off, taking effect next cycle.
- Card, invoices, pause and cancel all go to the **Stripe Customer Portal**.

**Other:**
- Taste profile, with a "Refă quiz-ul" link.
- Rated coffees table, with "Comandă din nou" (adds a full bag to the next box at the roaster's retail price) or "25 lei aplicat".

**States:**
- After the deadline: swap and skip are disabled, with a tooltip "Prea târziu pentru luna aceasta".
- Paused or cancelled: the header shows the status pill and a "Reactivează" button.

### 10. Admin, Box tab [Admin]

**Cycle chips:** 1–5 pick, 5 billing, 10 order bags, 20 bags arrive, 21–23 pack, 22–25 ship.

**KPI cards:** active subscriptions, skips, swaps, gift and one-off orders, cancellations.

**"Bags to order" table:** roaster, coffee, bags, price per bag, roast-by date, status.
- Bags = active boxes − skips + 1 spare per 20 boxes; swaps move a bag to the alternate coffee.
- An "Export order sheet" button (CSV).

**Other panels:**
- Packing list, with "Print labels & cards" (PDF, one card per coffee per box).
- Last month's ratings: response rate, average, credits issued, nominations.

**Language:** admin copy is in English. Everything customer-facing is in Romanian.

## Responsive

| Breakpoint | Changes |
|---|---|
| ≥ 1024px | Box cards 4 across, quiz and plan in 2 columns, summary sticky |
| 768–1023px | Box cards 2 across; quiz and plan side panel drops under the content |
| < 768px | Everything 1 column. The nav links collapse into the existing mobile menu, but the "Contul meu" pill stays. H1 clamps at 2.6rem. Tables scroll sideways. |

Grids use `repeat(auto-fit, minmax(240px, 1fr))` as in the designs. The container is `--container-max` (1200px) with 24px side padding.

## Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Buttons, box cards | hover / active | translate ±1–2px, shadow 3→6px | 110–140ms | ease |
| Ticker | always | translateX loop (exists) | 26s | linear |
| Quiz progress bar | step change | width | 240ms | ease |
| Quiz step | next / back | crossfade only, no slide | 160ms | ease-out |

Turn all of these off for `prefers-reduced-motion` (`box.css` already does).

## Accessibility

- Real `<button>`, `<a>`, `<input>` and `<label>` elements everywhere; never clickable divs. The designs already follow this.
- Focus ring: 3px `--blue` outline, offset 3px, on every interactive element.
- Focus order follows reading order. On the plan page: box, then frequency, then fields, then pay.
- Seal images need alt text. Stickers are decorative, so repeat their meaning in real text nearby.
- Contrast: ink text on bright fills, cream text on ink. Never put text on blue or on gold-as-text.
- Announce form errors with `aria-live="polite"`, and announce the 25 lei credit message on the review page.
- Set `lang="ro"` on customer pages and `lang="en"` on admin.

## Copy and content rules

- **Placeholders:** text in `[brackets]` in the designs is a placeholder to fill from data.
- **Roaster names** (Narcoffee, Yume, MABÓ, Hotspot, Black Habit) and their coffees are **examples**. Don't ship them until each roaster has agreed. Gate this with `roasters.public`.
- **No fake reviews, ratings or "only X left".** This is policy, from the offer and the consumer-protection rules.
- **Price strings** always include "lei"; VAT is included.
- **Legal:** the guarantee wording ("25 lei reducere") and the subscription terms still need a legal check (ANPC), per `docs/brand.md` and the plan.

## Open questions for the team

1. Sameday / FAN locker picker: an API widget or a manual field for v1?
2. The minimum number of ratings before a coffee shows on the ranking (suggested: 10).
3. Credit mechanism: Stripe customer balance or a one-time coupon? Customer balance is simpler.
4. Auth for `/account`: Firebase email link, or the Stripe Customer Portal only for v1?
5. Who owns photography of the real boxes, and by when? It's needed for the gift page by about 15 Nov.

## Build order (from `docs/webshop.md`)

| Done by | Step |
|---|---|
| 15 Nov 2026 | `/box/gift`, one-off checkout, real box photos |
| 18 Nov | `/box` home and waitlist |
| 10 Dec | Webhook, `subscribers` collection, plans and coupon in the Worker |
| 20 Dec | Quiz, plan page, Customer Portal |
| 28 Dec | Review page, `ratings`, QR codes on cards |
| 3 Jan 2027 | Admin Box tab, preview email |
| 5 Jan | First billing |
| Feb | Public ranking, roasters page, reorder favourites |
