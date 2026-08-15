import { renderChrome, escapeHtml, originClass, toast } from './components.js';
import { icon } from './icons.js';
import { getProducts } from './catalog.js';
import { getCart, setQty, removeFromCart, clearCart } from './cart.js';
import { formatMoney } from './data.js';

renderChrome();

const root = document.getElementById('cart-root');
let catalog = [];

function lineItems() {
  return getCart()
    .map((ci) => {
      const p = catalog.find((x) => x.id === ci.id);
      return p ? { ...p, qty: ci.qty } : null;
    })
    .filter(Boolean);
}

function emptyHTML() {
  return `<div class="empty-state">
    <p style="font-size:18px; margin-bottom:18px">Your cart is empty.</p>
    <a class="btn btn--primary" href="shop.html">Browse the shop</a>
  </div>`;
}

function buyControl(i) {
  return i.stripeLink
    ? `<a class="btn btn--primary btn--sm" href="${escapeHtml(i.stripeLink)}">Buy</a>`
    : `<button class="btn btn--primary btn--sm" data-buy-missing type="button">Buy</button>`;
}

function lineHTML(i) {
  return `
  <div class="cart-line" data-id="${escapeHtml(i.id)}">
    <a class="cart-line__media" href="product.html?id=${encodeURIComponent(i.id)}">${i.image ? `<img src="${escapeHtml(i.image)}" alt="${escapeHtml(i.name)}">` : ''}</a>
    <div>
      ${i.originLabel ? `<div class="cart-line__origin" style="color:var(--origin-${originClass(i.origin)})">${escapeHtml(i.originLabel)}</div>` : ''}
      <a class="cart-line__name" href="product.html?id=${encodeURIComponent(i.id)}">${escapeHtml(i.name)}</a>
      <div class="cart-line__unit">${formatMoney(i.price)} each</div>
    </div>
    <div class="cart-line__right">
      <div class="qty">
        <button class="qty__btn" data-step="-1" type="button" aria-label="Decrease">${icon('minus', 14)}</button>
        <span class="qty__val">${i.qty}</span>
        <button class="qty__btn" data-step="1" type="button" aria-label="Increase">${icon('plus', 14)}</button>
      </div>
      <span class="cart-line__price">${formatMoney(i.price * i.qty)}</span>
      ${buyControl(i)}
      <button class="cart-remove" data-remove type="button" aria-label="Remove ${escapeHtml(i.name)}">${icon('trash-2', 14)} Remove</button>
    </div>
  </div>`;
}

function render() {
  const items = lineItems();
  if (!items.length) {
    root.innerHTML = emptyHTML();
    return;
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  root.innerHTML = `
    <div class="cart-grid">
      <div class="cart-lines">${items.map(lineHTML).join('')}</div>
      <div class="cart-summary panel">
        <div class="cart-summary__row"><span>Subtotal (est.)</span><span class="mono">${formatMoney(subtotal)}</span></div>
        <div class="cart-summary__row"><span>Shipping</span><span style="color:var(--text-secondary)">Calculated at checkout</span></div>
        <div class="notice" style="margin-top:8px">Each bag checks out on its own secure Stripe page — press <strong>Buy</strong> on an item, and set the final quantity there.</div>
        <button class="btn btn--ghost btn--sm" id="clear" type="button">Clear cart</button>
      </div>
    </div>`;
}

// Delegated handlers (root persists across re-renders)
root.addEventListener('click', (e) => {
  const line = e.target.closest('.cart-line');
  const step = e.target.closest('[data-step]');
  const rem = e.target.closest('[data-remove]');
  if (step && line) {
    const id = line.dataset.id;
    const cur = getCart().find((i) => i.id === id)?.qty || 1;
    setQty(id, cur + Number(step.dataset.step));
  } else if (rem && line) {
    removeFromCart(line.dataset.id);
  } else if (e.target.closest('[data-buy-missing]')) {
    toast('Payment link not set yet — see SETUP.md');
  } else if (e.target.closest('#clear')) {
    clearCart();
  }
});

window.addEventListener('cart:changed', render);

(async () => {
  catalog = await getProducts();
  render();
})();
