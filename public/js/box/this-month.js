import { db, doc, getDoc } from '/js/firebase.js';
import { renderBoxChrome, monthKey, monthName, fmtDate, escapeHtml, isFoundingOfferOn, getPlans, BOX_CONFIG } from '/js/box/shared.js';

renderBoxChrome('this-month');

const head = document.getElementById('head');
const body = document.getElementById('body');

const param = new URLSearchParams(location.search).get('m');
const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(param || '') ? param : monthKey();

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const dm = (iso) => fmtDate(iso, { day: 'numeric', month: 'numeric' }).replace(/\.?$/, '');
const upper = (s) => String(s).toLocaleUpperCase('ro-RO');

function specRows(c) {
  const rows = [
    ['Origine', c.origin], ['Proces', c.process],
    ['Altitudine', has(c.altitude) ? (/m\b/i.test(String(c.altitude)) ? c.altitude : `${c.altitude} m`) : null],
    ['Prăjit', has(c.roastDate) ? (fmtDate(c.roastDate) || c.roastDate) : null],
  ].filter(([, v]) => has(v));
  return rows.length ? `<dl class="spec">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('')}</dl>` : '';
}

function coffeeCard(slot, c) {
  const tier = ['duo', 'trio', 'reserve'].includes(c.tier) ? c.tier : 'trio';
  const tag = [slot.slot, c.city].filter(has).map((s) => upper(s)).join(' · ');
  const notes = Array.isArray(c.notes) ? c.notes.filter(has) : [];
  const methods = Array.isArray(c.methods) ? c.methods.filter(has) : [];
  const good = has(c.goodFor) ? c.goodFor : methods.join(' · ');
  return `<article class="coffee-card coffee-card--${tier}">
    <div class="coffee-card__media" aria-hidden="true"></div>
    <div class="coffee-card__body">
      ${tag ? `<span class="coffee-card__tag">${escapeHtml(tag)}</span>` : ''}
      <h3>${escapeHtml(c.name || 'Cafea')}</h3>
      ${has(c.roasterName) ? `<p class="coffee-card__roaster">${escapeHtml(c.roasterName)}</p>` : ''}
      ${specRows(c)}
      ${notes.length ? `<p><strong>Note:</strong> ${notes.map(escapeHtml).join(', ')}</p>` : ''}
      ${has(good) ? `<p><strong>Bună pentru:</strong> ${escapeHtml(good)}</p>` : ''}
    </div></article>`;
}

function dateItem(label, iso) {
  const t = has(iso) ? fmtDate(iso) : '';
  return t ? `<div><dt>${label}</dt><dd>${escapeHtml(t)}</dd></div>` : '';
}

async function trioPriceLine() {
  try {
    const p = await getPlans();
    const one = p.oneOff && p.oneOff.trio && Number(p.oneOff.trio.price);
    const parts = [];
    if (one) parts.push(`Trio o singură dată ${one} lei`);
    if (isFoundingOfferOn() && p.founding && p.founding.active && p.founding.firstBoxPrice) parts.push(`prima cutie de abonament ${p.founding.firstBoxPrice} lei`);
    return parts.length ? `${parts.join(', sau ')}.` : '';
  } catch { return ''; }
}

async function main() {
  let box = null;
  try {
    const snap = await getDoc(doc(db, 'boxes', key));
    box = snap.exists() ? snap.data() : null;
  } catch (e) {
    head.innerHTML = `<h1>Cutia lunii</h1>`;
    body.innerHTML = `<div class="notice" role="alert">Nu am putut încărca cutia lunii. Încearcă din nou în câteva momente.</div>`;
    return;
  }
  const luna = monthName(key);
  document.title = `Cutia lunii, ${luna} — Genus Coffee Box`;

  if (!box || !box.published) {
    const when = box && has(box.announceDate) ? fmtDate(box.announceDate) : '';
    head.innerHTML = `<span class="sticker">Cutia lunii · ${escapeHtml(upper(luna))}</span><h1>${when ? `Line-up-ul se anunță pe ${escapeHtml(when)}` : 'Line-up-ul se anunță în curând'}</h1>`;
    body.innerHTML = `<div class="empty-state"><p>Revino aici ca să vezi cele trei cafele ale lunii.</p><a class="btn btn--secondary" href="/box/">ÎNAPOI LA CUTII</a></div>`;
    return;
  }

  head.innerHTML = `
    <span class="sticker">Cutia lunii · ${escapeHtml(upper(luna))}</span>
    ${has(box.theme) ? `<h1>${escapeHtml(box.theme)}</h1>` : '<h1>Cutia lunii</h1>'}
    ${has(box.intro) ? `<p>${escapeHtml(box.intro)}</p>` : ''}
    <dl class="month-dates">${dateItem('PRĂJIRE', box.roastDate)}${dateItem('LIVRARE', box.deliveryDate)}</dl>`;

  const slots = Array.isArray(box.coffees) ? box.coffees : [];
  const results = await Promise.all(slots.map(async (s) => {
    try {
      const cs = await getDoc(doc(db, 'coffees', String(s.coffeeId)));
      return cs.exists() ? coffeeCard(s, cs.data()) : '';
    } catch { return null; }
  }));
  const failed = results.some((r) => r === null);
  const cards = results.filter(Boolean);

  const price = await trioPriceLine();
  body.innerHTML = `
    ${failed ? '<div class="notice" role="alert">Unele cafele nu s-au putut încărca.</div>' : ''}
    ${cards.length ? `<div class="coffee-grid">${cards.join('')}</div>` : '<div class="empty-state">Cafelele se adaugă în curând.</div>'}
    <div class="cta-grid" style="margin-top: var(--space-7)">
      <div class="cta-card"><h2>Ești abonat? Schimbă o cafea</h2>
        <p>Până cu ${BOX_CONFIG.swapDeadlineDays} zile înainte de facturare poți înlocui orice cafea cu alternativa lunii sau poți sări luna din contul tău.</p>
        <a class="btn btn--secondary" href="/account.html">MERGI LA CONTUL MEU →</a></div>
      <div class="cta-card"><h2>Vrei cutia aceasta?</h2>
        ${price ? `<p>${escapeHtml(price)}</p>` : ''}
        <a class="btn btn--primary" href="/box/plan.html?box=trio">COMANDĂ →</a></div>
    </div>`;
}

main();
