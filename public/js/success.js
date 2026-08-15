import { renderChrome } from './components.js';
import { removeFromCart } from './cart.js';

// Payment succeeded. If the Payment Link's confirmation URL includes
// ?id=<productId> (see SETUP.md), remove just that bag from the cart;
// otherwise leave the cart untouched (they may have bought only one item).
const id = new URLSearchParams(location.search).get('id');
if (id) removeFromCart(id);
renderChrome();
