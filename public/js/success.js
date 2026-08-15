import { renderChrome } from './components.js';
import { clearCart } from './cart.js';

// Payment succeeded — empty the cart and refresh the badge.
clearCart();
renderChrome();
