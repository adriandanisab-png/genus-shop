// Genus Coffee — shared UI: nav/footer chrome, cards, accordion, toast.
import { icon } from './icons.js';
import { formatMoney } from './data.js';
import { cartCount, addToCart } from './cart.js';

const VALID_ORIGINS = ['colombia', 'costarica', 'ethiopia', 'kenya', 'rwanda'];

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
export function originClass(origin) {
  return VALID_ORIGINS.includes(origin) ? origin : 'colombia';
}

const ORIGIN_COLOR = { colombia: 'brown', costarica: 'red', ethiopia: 'gold', kenya: 'green', rwanda: 'pink' };

function tickerHTML() {
  const items = ['Small-batch', 'Roasted in Oradea', '<b>Free shipping over 200 lei</b>', 'Single origin', 'Roasted to order', 'Dangerously drinkable'];
  const seq = items.map((t) => `<span>${t}</span>✺`).join('');
  return `<div class="ticker"><div class="ticker__track">${seq}${seq}</div></div>`;
}

/* ---------------------------------------------------------------- chrome */
export function renderChrome(active) {
  const nav = document.getElementById('site-nav');
  if (nav) {
    nav.innerHTML = `
      ${tickerHTML()}
      <nav class="nav">
        <a class="nav__brand" href="index.html">Genus</a>
        <div class="nav__links">
          <a class="nav__link${active === 'shop' ? ' is-active' : ''}" href="shop.html">Shop</a>
          <a class="nav__link${active === 'subscribe' ? ' is-active' : ''}" href="subscribe.html">Subscribe</a>
          <a class="nav__link${active === 'events' ? ' is-active' : ''}" href="events.html">Events</a>
        </div>
        <a class="nav__cart" href="cart.html" aria-label="Cart">
          ${icon('shopping-bag', 18)}
          <span class="cart-badge" data-cart-badge hidden>0</span>
        </a>
      </nav>`;
  }
  const footer = document.getElementById('site-footer');
  if (footer) footer.innerHTML = footerHTML();
  updateCartBadge();
  window.addEventListener('cart:changed', updateCartBadge);
}

function footerHTML() {
  return `
  <footer class="footer">
    <div class="footer__inner">
      <div>
        <div class="footer__brand">Genus</div>
        <div class="footer__brandsub">COFFEE</div>
      </div>
      <div class="footer__cols">
        <div class="footer__col">
          <span class="footer__head">Shop</span>
          <a href="shop.html">Single origin</a>
          <a href="subscribe.html">Subscription</a>
        </div>
        <div class="footer__col">
          <span class="footer__head">Events</span>
          <a href="events.html">Book the cart</a>
          <a href="events.html#faq">FAQ</a>
        </div>
        <div class="footer__col">
          <span class="footer__head">Find us</span>
          <span>Oradea, România</span>
          <a href="https://instagram.com/genuscoffee" target="_blank" rel="noopener">@genuscoffee</a>
        </div>
      </div>
    </div>
    <div class="footer__bottom">© ${new Date().getFullYear()} Genus Coffee</div>
  </footer>`;
}

export function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll('[data-cart-badge]').forEach((el) => {
    el.textContent = n;
    el.hidden = n === 0;
  });
}

/* ---------------------------------------------------------------- toast */
let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

/* ---------------------------------------------------------------- product card */
export function productCardHTML(p) {
  const color = ORIGIN_COLOR[originClass(p.origin)] || 'gold';
  return `
  <div class="product-card product-card--${color}">
    <a class="product-card__overlay" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${escapeHtml(p.name)}"></a>
    <div class="product-card__media">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">` : ''}</div>
    <div class="product-card__body">
      ${p.originLabel ? `<span class="product-card__origin">${escapeHtml(p.originLabel)}</span>` : ''}
      <h3 class="product-card__name">${escapeHtml(p.name)}</h3>
      ${p.notes ? `<div class="product-card__notes">${escapeHtml(p.notes)}</div>` : ''}
      <div class="product-card__foot">
        <span class="product-card__price">${formatMoney(p.price)}</span>
        <button class="product-card__add" data-add="${escapeHtml(p.id)}" type="button">Add +</button>
      </div>
    </div>
  </div>`;
}

// Delegated add-to-cart handler; safe for dynamically injected cards.
export function wireAddToCart(root = document) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    addToCart(btn.dataset.add, 1);
    toast('Added to cart');
  });
}

/* ---------------------------------------------------------------- event card */
export function eventCardHTML(pkg, selected) {
  return `<div class="event-card${selected ? ' is-selected' : ''}" data-pkg="${escapeHtml(pkg.key)}" role="button" tabindex="0" aria-pressed="${!!selected}">
    <span class="event-card__icon">${icon(pkg.icon, 26)}</span>
    <h3 class="event-card__title">${escapeHtml(pkg.title)}</h3>
    <p class="event-card__desc">${escapeHtml(pkg.description)}</p>
    ${pkg.details && pkg.details.length ? `<ul class="event-card__list">${pkg.details.map((d) => `<li>${icon('check', 14)}${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
    ${pkg.price ? `<div class="event-card__price">${escapeHtml(pkg.price)}</div>` : ''}
  </div>`;
}

/* ---------------------------------------------------------------- accordion */
export function accordionHTML(items, openIndex = 0) {
  return `<div class="accordion">${items.map((it, i) => `
    <div class="accordion__item${i === openIndex ? ' is-open' : ''}">
      <button class="accordion__trigger" type="button" aria-expanded="${i === openIndex}">
        <span>${escapeHtml(it.q)}</span>
        <span class="accordion__ic">${icon('plus', 16, 'i-plus')}${icon('minus', 16, 'i-minus')}</span>
      </button>
      <div class="accordion__panel"${i === openIndex ? '' : ' hidden'}>${escapeHtml(it.a)}</div>
    </div>`).join('')}</div>`;
}
export function wireAccordion(root) {
  root.querySelectorAll('.accordion__trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.accordion__item');
      const isOpen = item.classList.contains('is-open');
      root.querySelectorAll('.accordion__item').forEach((it) => {
        it.classList.remove('is-open');
        it.querySelector('.accordion__trigger').setAttribute('aria-expanded', 'false');
        it.querySelector('.accordion__panel').setAttribute('hidden', '');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        item.querySelector('.accordion__panel').removeAttribute('hidden');
      }
    });
  });
}
