// Genus Coffee Box — shared chrome, config, tiers and Worker calls for /box pages.
// Every box page loads tokens.css, base.css, app.css and box.css with absolute
// paths, and calls renderBoxChrome() first. Data contract: handoff/docs/box-data.md.
import { escapeHtml } from '../components.js';
import { formatMoney } from '../data.js';

export { escapeHtml, formatMoney };

export const WORKER = 'https://genus-checkout.shop-genus-coffee.workers.dev';

// Dates drive copy, never hand edits (handoff README: founding offer, gift banner).
export const BOX_CONFIG = {
  foundingOfferEnds: '2027-01-31T23:59:59+02:00', // 199 lei first Trio box until then
  giftBannerFrom: '2026-11-01T00:00:00+02:00',
  giftOrderBy: '2026-12-15T23:59:59+02:00',
  minRatings: 10,        // a coffee shows on the ranking only after this many ratings
  swapDeadlineDays: 5,   // swap / skip close this many days before billing
  reviewCredit: 25,      // lei, for a 1–2★ rating, once per box
};

export const isFoundingOfferOn = (now = new Date()) => now <= new Date(BOX_CONFIG.foundingOfferEnds);

// Display data only. Prices always come from getPlans() (the Worker's table).
export const TIERS = {
  duo: { id: 'duo', name: 'Duo', contents: '1 prăjitorie invitată + Genus · 2 × 250g', seal: '/assets/box/seals/seal-duo.svg', alt: 'Cutia Duo, 2 prăjitorii' },
  trio: { id: 'trio', name: 'Trio', contents: '2 prăjitorii invitate + Genus · 3 × 250g', seal: '/assets/box/seals/seal-trio.svg', alt: 'Cutia Trio, 3 prăjitorii' },
  reserve: { id: 'reserve', name: 'Reserve', contents: 'Trio cu un micro-lot greu de găsit · 3 × 250g', seal: '/assets/box/seals/seal-reserve.svg', alt: 'Cutia Reserve, cu un micro-lot' },
  gift: { id: 'gift', name: 'Gift Trio', contents: 'Trio în cutie de cadou, cu bilet scris de mână', seal: '/assets/box/seals/seal-gift.svg', alt: 'Cutia Gift Trio, cadou' },
};

export const FREQ_LABEL = { 1: 'Lunar', 2: 'La 2 luni', 0: 'O singură dată' };

/* ------------------------------------------------------------- Worker calls */

// GET /plans → {
//   subscriptions: { duo|trio|reserve: { name, price, intervals: [1, 2] } },
//   oneOff:        { duo|trio: { id, price } },              // POST / with {id, qty}
//   gift:          { 1|3|6: { id, price } },                 // months → product id
//   founding:      { active, plan: 'trio', firstBoxPrice: 199, endsAt }
// }
let plansPromise = null;
export function getPlans() {
  if (!plansPromise) {
    plansPromise = fetch(`${WORKER}/plans`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`plans ${r.status}`))))
      .catch((e) => { plansPromise = null; throw e; });
  }
  return plansPromise;
}

// Subscription: { plan, interval_count, coupon?, customer: {name,email,phone,locker}, tasteProfile? }
// One-off / gift: { items: [{id, qty}], customer: {...}, gift?: {recipient, address, note} }
// Resolves only by redirecting to Stripe Checkout; throws Error on failure.
export async function startBoxCheckout(payload) {
  const isSub = !!payload.plan;
  const origin = location.origin;
  const res = await fetch(isSub ? `${WORKER}/subscribe` : `${WORKER}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      box: true,
      successUrl: `${origin}/success.html`,
      cancelUrl: location.href.split('#')[0],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'Plata nu a pornit, încearcă din nou');
  location.assign(data.url);
}

// Authenticated call for /account (Firebase ID token of the signed-in customer).
export async function userFetch(user, path, body) {
  const token = await user.getIdToken();
  const res = await fetch(WORKER + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Eroare (${res.status})`);
  return data;
}

/* ------------------------------------------------------------- helpers */

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function fmtDate(iso, opts = { day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ro-RO', opts);
}

export function monthName(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
}

/* ------------------------------------------------------------- chrome */

function tickerHTML() {
  const items = ['3 prăjitorii românești', 'Livrare gratuită la easybox', 'Prăjit acum max. 7 zile'];
  if (isFoundingOfferOn()) items.push('<b>Prima cutie 199 lei</b>');
  const seq = items.map((t) => `<span>${t}</span>●`).join('');
  return `<div class="ticker" aria-hidden="true"><div class="ticker__track">${seq}${seq}</div></div>`;
}

export function renderBoxChrome(active) {
  const link = (key, href, label) => `<a class="nav__link${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const nav = document.getElementById('site-nav');
  if (nav) {
    nav.innerHTML = `
      ${tickerHTML()}
      <nav class="nav box-nav" aria-label="Principal">
        <a class="nav__brand" href="/box/">Genus <span class="sticker box-nav__sticker">Box</span></a>
        <div class="nav__links">
          ${link('quiz', '/box/quiz.html', 'Quiz')}
          ${link('this-month', '/box/this-month.html', 'Cutia lunii')}
          ${link('gift', '/box/gift.html', 'Cadou')}
          ${link('roasters', '/box/roasters.html', 'Prăjitorii')}
          ${link('ratings', '/box/ratings.html', 'Clasament')}
          <a class="nav__link" href="/shop.html">Magazin</a>
        </div>
        <a class="btn btn--inverse btn--sm box-nav__account" href="/account.html">Contul meu</a>
      </nav>`;
  }
  const footer = document.getElementById('site-footer');
  if (footer) footer.innerHTML = footerHTML();
}

function footerHTML() {
  return `
  <footer class="footer">
    <div class="footer__inner">
      <div>
        <div class="footer__brand">Genus</div>
        <div class="footer__brandsub">COFFEE BOX</div>
      </div>
      <div class="footer__cols">
        <div class="footer__col">
          <span class="footer__head">Cutia</span>
          <a href="/box/quiz.html">Quiz</a>
          <a href="/box/plan.html">Abonament</a>
          <a href="/box/gift.html">Cadou</a>
          <a href="/account.html">Contul meu</a>
        </div>
        <div class="footer__col">
          <span class="footer__head">Legal</span>
          <a href="/termeni.html">Termeni și condiții</a>
          <a href="https://anpc.ro/" target="_blank" rel="noopener">ANPC</a>
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">SOL</a>
        </div>
        <div class="footer__col">
          <span class="footer__head">Contact</span>
          <span>Oradea, România</span>
          <a href="https://wa.me/40723910971" target="_blank" rel="noopener">WhatsApp 0723 910 971</a>
          <a href="https://instagram.com/genuscoffee" target="_blank" rel="noopener">@genuscoffee</a>
        </div>
      </div>
    </div>
    <div class="footer__bottom">© ${new Date().getFullYear()} Genus Coffee · Prețurile includ TVA</div>
  </footer>`;
}
