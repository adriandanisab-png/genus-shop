import { renderChrome, escapeHtml, originClass } from './components.js';
import { icon } from './icons.js';
import { getProducts } from './catalog.js';
import { getCart, setQty, removeFromCart, clearCart } from './cart.js';
import { formatMoney } from './data.js';
import { startCheckout } from './checkout.js';

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
        <div class="cart-summary__row"><span>Subtotal</span><span class="mono">${formatMoney(subtotal)}</span></div>
        <div class="cart-summary__row"><span>Shipping</span><span style="color:var(--text-secondary)">Calculated at checkout</span></div>
        <div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>${formatMoney(subtotal)}</span></div>
        <button class="btn btn--primary btn--lg btn--block" id="checkout" type="button" style="margin-top:8px">Checkout</button>
        <div class="notice" id="checkout-note" hidden style="margin-top:4px"></div>
        <button class="btn btn--ghost btn--sm" id="clear" type="button">Clear cart</button>
      </div>
    </div>`;
}

async function doCheckout() {
  const note = document.getElementById('checkout-note');
  const btn = document.getElementById('checkout');
  if (note) note.hidden = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Starting checkout…'; }
  await startCheckout((msg) => {
    if (note) { note.textContent = msg; note.hidden = false; }
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
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
  } else if (e.target.closest('#checkout')) {
    doCheckout();
  } else if (e.target.closest('#clear')) {
    clearCart();
  }
});

window.addEventListener('cart:changed', render);

(async () => {
  catalog = await getProducts();
  render();
})();
