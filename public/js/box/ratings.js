import { db, collection, getDocs } from '/js/firebase.js';
import { renderBoxChrome, BOX_CONFIG, escapeHtml } from '/js/box/shared.js';

renderBoxChrome('ratings');

const N = BOX_CONFIG.minRatings;
const FILTERS = [['coffees', 'Cafele'], ['roasters', 'Prăjitorii'], ['filtru', 'Filtru'], ['espresso', 'Espresso']];
let rows = [];
let current = 'coffees';

document.getElementById('intro').textContent = `Notele vin doar de la abonați care au primit cafeaua în cutie. O cafea intră în clasament după cel puțin ${N} note.`;
document.getElementById('how').innerHTML = `<strong>Cum calculăm:</strong> media notelor de 1–5 stele, doar de la cei care au primit cafeaua, cu cel puțin ${N} note. Nu există note plătite sau de la prăjitorii înșiși.`;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function aggregateRoasters(list) {
  const map = new Map();
  for (const r of list) {
    const name = String(r.roasterName || '').trim();
    if (!name) continue;
    const m = map.get(name) || { name, city: r.city || '', sum: 0, count: 0 };
    m.sum += num(r.avg) * num(r.count);
    m.count += num(r.count);
    if (!m.city && r.city) m.city = r.city;
    map.set(name, m);
  }
  return [...map.values()].map((m) => ({ roasterName: m.name, city: m.city, count: m.count, avg: m.count ? m.sum / m.count : 0 }));
}

function sortRows(list) {
  return [...list].sort((a, b) => {
    const ra = num(a.count) >= N, rb = num(b.count) >= N;
    if (ra !== rb) return ra ? -1 : 1;
    return ra ? num(b.avg) - num(a.avg) || num(b.count) - num(a.count) : num(b.count) - num(a.count);
  });
}

function cellNums(r) {
  return num(r.count) >= N
    ? [`<td class="num">★ ${num(r.avg).toFixed(1)}</td>`, `<td class="num">${num(r.count)}</td>`]
    : ['<td class="num soon">★ în curând</td>', '<td class="num soon">—</td>'];
}

function render() {
  const out = document.getElementById('results');
  document.querySelectorAll('#filters .seg__item').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === current)));
  let list;
  if (current === 'roasters') list = aggregateRoasters(rows);
  else if (current === 'coffees') list = rows;
  else list = rows.filter((r) => Array.isArray(r.methods) && r.methods.map((m) => String(m).toLowerCase()).includes(current));
  if (!list.length) {
    out.innerHTML = `<div class="empty-state"><p>${rows.length ? 'Nicio cafea în această categorie încă.' : 'Clasamentul apare după primele note de la abonați. Revino curând.'}</p></div>`;
    return;
  }
  list = sortRows(list);
  const isR = current === 'roasters';
  const body = list.map((r, i) => {
    const ranked = num(r.count) >= N;
    const notes = Array.isArray(r.notes) ? r.notes.join(', ') : (r.notes || '');
    const place = [r.roasterName, r.city].filter(Boolean).join(' · ');
    return `<tr><td class="num">${ranked ? i + 1 : '—'}</td>
      <td><strong>${escapeHtml(isR ? (r.roasterName || '') : (r.coffeeName || ''))}</strong></td>
      ${isR ? `<td>${escapeHtml(r.city || '')}</td>` : `<td>${escapeHtml(place)}</td><td>${escapeHtml(notes)}</td>`}
      ${cellNums(r).join('')}</tr>`;
  }).join('');
  out.innerHTML = `<div class="table-scroll"><table class="rank-table">
    <thead><tr><th class="num">#</th><th scope="col">${isR ? 'PRĂJITORIE' : 'CAFEA'}</th>${isR ? '<th scope="col">ORAȘ</th>' : '<th scope="col">PRĂJITORIE · ORAȘ</th><th scope="col">NOTE DE GUST</th>'}<th class="num" scope="col">NOTA</th><th class="num" scope="col">NR. NOTE</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

document.getElementById('filters').innerHTML = FILTERS.map(([k, l]) => `<button type="button" class="seg__item" data-f="${k}" aria-pressed="${k === current}">${l}</button>`).join('');
document.getElementById('filters').addEventListener('click', (e) => {
  const b = e.target.closest('.seg__item');
  if (b) { current = b.dataset.f; render(); }
});

(async () => {
  try {
    const snap = await getDocs(collection(db, 'rankings'));
    rows = snap.docs.map((d) => d.data()).filter((r) => !r.kind || r.kind === 'coffee');
    render();
  } catch (e) {
    document.getElementById('results').innerHTML = '<div class="notice" role="alert">Nu am putut încărca clasamentul. Încearcă din nou în câteva momente.</div>';
  }
})();
