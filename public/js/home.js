import { renderChrome, productCardHTML, wireAddToCart } from './components.js';
import { getProducts } from './catalog.js';
import { FEATURED_IDS } from './data.js';

renderChrome('home');
wireAddToCart();

(async () => {
  const products = await getProducts();
  const featured = FEATURED_IDS
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  const list = featured.length ? featured : products.slice(0, 3);
  document.getElementById('featured').innerHTML = list.map(productCardHTML).join('');
})();
