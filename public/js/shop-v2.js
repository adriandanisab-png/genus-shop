// Playful shop trial. Reuses the real catalog + cart; only the look is new.
import { getProducts } from './catalog.js';
import { addToCart, cartCount } from './cart.js';
import { escapeHtml } from './components.js';

const COLORS = ['pink', 'green', 'red', 'gold', 'brown'];
const grid = document.getElementById('grid');
const sortEl = document.getElementById('sort');
const countEl = document.querySelector('[data-cart-count]');

let all = [];
let sort = 'featured';
const qty = {}; // id -> chosen quantity

// duplicate ticker content so the marquee loops seamlessly
const ticker = document.getElementById('ticker');
if (ticker) ticker.innerHTML += ticker.innerHTML;

function updateCount() { if (countEl) countEl.textContent = cartCount(); }
window.addEventListener('cart:changed', updateCount);
updateCount();

function sorted() {
  const list = [...all];
  if (sort === 'price') list.sort((a, b) => a.price - b.price);
  else if (sort === 'origin') list.sort((a, b) => String(a.originLabel).localeCompare(String(b.originLabel)));
  return list;
}

function cardHTML(p, i) {
  const c = COLORS[i % COLORS.length];
  const q = qty[p.id] || 1;
  return `
  <article class="tcard tcard--${c}" data-id="${escapeHtml(p.id)}">
    <a class="tcard__media" href="product.html?id=${encodeURIComponent(p.id)}">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">` : ''}</a>
    <div class="tcard__body">
      <div class="tcard__row">
        <span class="tcard__origin">${escapeHtml(p.originLabel || p.origin || '')}</span>
        <span class="tcard__price">${escapeHtml(String(p.price))} lei</span>
      </div>
      <h3 class="tcard__name">${escapeHtml(p.name)}</h3>
      <p class="tcard__notes">${escapeHtml(p.notes || '')}</p>
      <div class="tcard__foot">
        <div class="tqty">
          <button data-step="-1" type="button" aria-label="Less">–</button>
          <span data-qty>${q}</span>
          <button data-step="1" type="button" aria-label="More">+</button>
        </div>
        <button class="tadd" data-add type="button">Add +</button>
      </div>
    </div>
  </article>`;
}

function render() {
  grid.innerHTML = sorted().map(cardHTML).join('');
}

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.tcard');
  if (!card) return;
  const id = card.dataset.id;
  const step = e.target.closest('[data-step]');
  if (step) {
    qty[id] = Math.max(1, Math.min(99, (qty[id] || 1) + Number(step.dataset.step)));
    card.querySelector('[data-qty]').textContent = qty[id];
    return;
  }
  if (e.target.closest('[data-add]')) {
    const n = qty[id] || 1;
    addToCart(id, n);
    toast(`Added ${n} — nice choice :)`);
  }
});

sortEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sort]');
  if (!b) return;
  sort = b.dataset.sort;
  sortEl.querySelectorAll('.tchip').forEach((c) => c.classList.toggle('is-active', c === b));
  render();
});

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.ttoast');
  if (!el) { el = document.createElement('div'); el.className = 'ttoast'; document.body.appendChild(el); }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
}

(async () => {
  all = await getProducts();
  render();
})();
