// Genus Coffee — cart state. Stores only {id, qty} in localStorage; product
// details and prices are resolved from the catalog at render time, and the real
// price authority is server-side in the checkout Cloud Function.
const KEY = 'genus_cart_v1';

export function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

function save(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:changed'));
}

export function cartCount() {
  return getCart().reduce((n, i) => n + i.qty, 0);
}

export function addToCart(id, qty = 1) {
  const items = getCart();
  const existing = items.find((i) => i.id === id);
  if (existing) existing.qty += qty;
  else items.push({ id, qty });
  save(items);
}

export function setQty(id, qty) {
  let items = getCart();
  if (qty <= 0) {
    items = items.filter((i) => i.id !== id);
  } else {
    const existing = items.find((i) => i.id === id);
    if (existing) existing.qty = qty;
    else items.push({ id, qty });
  }
  save(items);
}

export function removeFromCart(id) {
  save(getCart().filter((i) => i.id !== id));
}

export function clearCart() {
  save([]);
}
