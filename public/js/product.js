import { renderChrome, escapeHtml, originClass, accordionHTML, wireAccordion, toast } from './components.js';
import { icon } from './icons.js';
import { getProduct } from './catalog.js';
import { formatMoney } from './data.js';
import { addToCart } from './cart.js';

renderChrome();

const root = document.getElementById('pd');
const id = new URLSearchParams(location.search).get('id');

(async () => {
  const p = await getProduct(id);
  if (!p) {
    root.innerHTML = `<div class="empty-state">
      <p>That coffee wasn't found.</p>
      <p style="margin-top:12px"><a class="text-link" href="shop.html">← Back to shop</a></p>
    </div>`;
    return;
  }

  document.title = `${p.name} — Genus Coffee`;

  root.innerHTML = `
    <a class="pd-back" href="shop.html">${icon('arrow-left', 14)} Back to shop</a>
    <div class="pd-grid">
      <div class="pd-media">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : ''}</div>
      <div>
        <span class="badge badge--origin-${originClass(p.origin)}">${escapeHtml(p.originLabel || '')}</span>
        <h1 class="pd-title">${escapeHtml(p.name)}</h1>
        <p class="pd-notes">${escapeHtml(p.notes || '')}</p>
        <div class="pd-spec">
          <span>REGION / ALTITUDE&nbsp;&nbsp;${escapeHtml(p.region || '')}</span>
          <span>WEIGHT&nbsp;&nbsp;${escapeHtml(p.weight || '250g')}</span>
          <span>ROAST&nbsp;&nbsp;${escapeHtml(p.roast || 'Omniroast')}</span>
        </div>
        <div class="pd-price">${formatMoney(p.price)}</div>
        <div class="pd-buy">
          <div class="qty" id="qty">
            <button class="qty__btn" data-step="-1" type="button" aria-label="Decrease quantity">${icon('minus', 14)}</button>
            <span class="qty__val" data-qty-value>1</span>
            <button class="qty__btn" data-step="1" type="button" aria-label="Increase quantity">${icon('plus', 14)}</button>
          </div>
          <button class="btn btn--secondary btn--lg" id="add" type="button">${icon('shopping-bag', 16)} Add to cart</button>
          ${p.stripeLink
            ? `<a class="btn btn--primary btn--lg" href="${escapeHtml(p.stripeLink)}">Buy now</a>`
            : `<button class="btn btn--primary btn--lg" id="buy-missing" type="button">Buy now</button>`}
        </div>
        <div id="pd-acc"></div>
      </div>
    </div>`;

  // Quantity stepper
  let qty = 1;
  const valueEl = root.querySelector('[data-qty-value]');
  root.querySelector('#qty').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    qty = Math.max(1, Math.min(99, qty + Number(b.dataset.step)));
    valueEl.textContent = qty;
  });

  root.querySelector('#add').addEventListener('click', () => {
    addToCart(p.id, qty);
    toast(qty > 1 ? `Added ${qty} to cart` : 'Added to cart');
  });

  const buyMissing = root.querySelector('#buy-missing');
  if (buyMissing) buyMissing.addEventListener('click', () => toast('Payment link not set yet — see SETUP.md'));

  // Accordion
  const acc = root.querySelector('#pd-acc');
  acc.innerHTML = accordionHTML([
    { q: 'Grind options', a: 'Whole bean by default — select ground (filter, espresso, or moka) at checkout.' },
    { q: 'Shipping', a: 'Roasted and shipped within Romania in 2–4 business days.' },
  ]);
  wireAccordion(acc);
})();
