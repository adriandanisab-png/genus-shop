import { db, collection, query, where, getDocs, addDoc, serverTimestamp } from '/js/firebase.js';
import { renderBoxChrome, escapeHtml } from '/js/box/shared.js';

renderBoxChrome('roasters');

const list = document.getElementById('list');

function safeUrl(u) {
  try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

function card(r) {
  const name = String(r.name || '').trim();
  if (!name) return '';
  const logo = safeUrl(r.logo);
  const shop = safeUrl(r.shopUrl);
  const months = Array.isArray(r.monthsFeatured) ? r.monthsFeatured.filter(Boolean).join(', ') : '';
  return `<article class="rs-card">
    <div class="rs-top">
      <div class="rs-avatar" aria-hidden="true">${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">` : escapeHtml(name.charAt(0).toLocaleUpperCase('ro-RO'))}</div>
      <div><h2>${escapeHtml(name)}</h2>${r.city ? `<div class="rs-city">${escapeHtml(r.city)}</div>` : ''}</div>
    </div>
    ${r.story ? `<p class="rs-story">${escapeHtml(r.story)}</p>` : ''}
    ${months ? `<div class="rs-months">${escapeHtml(months)}</div>` : ''}
    ${shop ? `<a class="text-link" href="${escapeHtml(shop)}" target="_blank" rel="noopener">Magazinul lor →</a>` : ''}
  </article>`;
}

(async () => {
  try {
    const snap = await getDocs(query(collection(db, 'roasters'), where('public', '==', true)));
    const cards = snap.docs.map((d) => card(d.data())).filter(Boolean);
    list.innerHTML = cards.length
      ? `<div class="rs-grid">${cards.join('')}</div>`
      : '<div class="empty-state"><p>Prăjitoriile partenere se anunță în curând.</p></div>';
  } catch (e) {
    list.innerHTML = '<div class="notice" role="alert">Nu am putut încărca prăjitoriile. Încearcă din nou în câteva momente.</div>';
  }
})();

const form = document.getElementById('nom-form');
const msg = document.getElementById('nom-msg');
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const roaster = document.getElementById('nom-roaster').value.trim();
  const city = document.getElementById('nom-city').value.trim();
  const note = document.getElementById('nom-note').value.trim();
  msg.className = 'rs-msg';
  if (!roaster) { msg.textContent = 'Scrie numele prăjitoriei.'; msg.classList.add('notice'); return; }
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'nominations'), { roaster, city, note, source: 'roasters', createdAt: serverTimestamp() });
    msg.textContent = 'Mulțumim! Am notat nominalizarea.';
    form.reset();
  } catch (e) {
    msg.textContent = 'Nu am putut trimite. Încearcă din nou.';
    msg.classList.add('notice');
  } finally { btn.disabled = false; }
});
