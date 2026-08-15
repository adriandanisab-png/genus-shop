import { renderChrome, productCardHTML, wireAddToCart } from './components.js';
import { getProducts } from './catalog.js';
import { ORIGIN_FILTERS } from './data.js';

renderChrome('shop');
wireAddToCart();

const grid = document.getElementById('grid');
const filtersEl = document.getElementById('filters');
let all = [];
let filter = 'All';

function render() {
  const shown = filter === 'All' ? all : all.filter((p) => (p.originLabel || '').startsWith(filter));
  grid.innerHTML = shown.length
    ? shown.map(productCardHTML).join('')
    : '<p class="empty-state">No coffees in this origin yet.</p>';
}

filtersEl.innerHTML = ORIGIN_FILTERS
  .map((o) => `<button class="filter${o === 'All' ? ' is-active' : ''}" data-filter="${o}" type="button">${o}</button>`)
  .join('');

filtersEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  filter = b.dataset.filter;
  filtersEl.querySelectorAll('.filter').forEach((x) => x.classList.toggle('is-active', x === b));
  render();
});

(async () => {
  all = await getProducts();
  render();
})();
