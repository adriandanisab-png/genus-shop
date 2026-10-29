// Genus Coffee Box — review page (/box/review.html?b={boxId}&t={token}).
// Data contract: handoff/docs/box-data.md (ratings/{b}_{t}_{coffeeId}).
import { renderBoxChrome, escapeHtml, monthName, BOX_CONFIG, WORKER } from '/js/box/shared.js';
import { db, doc, getDoc, collection, addDoc, setDoc, serverTimestamp } from '/js/firebase.js';

renderBoxChrome('review');

const root = document.getElementById('rv');
const params = new URLSearchParams(location.search);
const boxId = params.get('b') || '';
const token = params.get('t') || '';
const TAGS = ['Fructat', 'Ciocolatos', 'Floral', 'Dulce', 'Acid', 'Amar'];
const STAR = '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.3L12 16.7 6.4 20l1.3-6.3L3 9.3l6.3-.7z"/></svg>';

let tokenDoc = null;
let coffees = [];            // [{coffeeId, slot, name, roaster}]
const state = new Map();     // coffeeId -> {stars, tags:Set, note}
const credited = new Set();  // coffeeIds already sent to /review/credit
let nomination = { roaster: '', sent: false };
let submitting = false;
let pendingRetry = false;

function expired() {
  root.innerHTML = `
    <div class="rv__head"><h1>Linkul a expirat</h1></div>
    <div class="notice" role="alert">Linkul a expirat, intră în cont.</div>
    <a class="btn btn--primary" href="/account.html">Intră în cont</a>`;
}

async function init() {
  if (!boxId || !token || !db) return expired();
  try {
    const t = await getDoc(doc(db, 'reviewTokens', token));
    if (!t.exists()) return expired();
    tokenDoc = t.data();
    const b = await getDoc(doc(db, 'boxes', boxId));
    if (!b.exists()) return expired();
    const box = b.data();
    const list = Array.isArray(box.coffees) ? box.coffees : [];
    const docs = await Promise.all(list.map((c) => getDoc(doc(db, 'coffees', c.coffeeId)).catch(() => null)));
    coffees = list.map((c, i) => {
      const d = docs[i] && docs[i].exists() ? docs[i].data() : {};
      return { coffeeId: c.coffeeId, slot: c.slot || '', name: d.name || c.coffeeId, roaster: d.roasterName || '' };
    });
    const prior = await Promise.all(coffees.map((c) => getDoc(doc(db, 'ratings', `${boxId}_${token}_${c.coffeeId}`)).catch(() => null)));
    coffees.forEach((c, i) => {
      const r = prior[i] && prior[i].exists() ? prior[i].data() : null;
      state.set(c.coffeeId, { stars: r ? Number(r.stars) || 0 : 0, tags: new Set(r && Array.isArray(r.tags) ? r.tags : []), note: r ? r.note || '' : '' });
      if (r && r.stars <= 2) credited.add(c.coffeeId); // already handled on the first submit
    });
    render();
  } catch (e) {
    root.innerHTML = `<div class="notice" role="alert">Nu am putut încărca pagina. Verifică internetul și reîncarcă.</div>`;
  }
}

function render() {
  const month = monthName(boxId);
  root.innerHTML = `
    <div class="rv__head">
      <h1>Cum ți s-a părut cutia de ${escapeHtml(month)}?</h1>
      <p>20 de secunde. Notele tale aleg cutia de luna viitoare.</p>
    </div>
    <form id="rvForm" novalidate>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${coffees.map(cardHTML).join('')}
        <div class="rv-card">
          <div class="field">
            <label class="field__label" for="nom">Ce prăjitorie vrei să vezi în cutie? (opțional)</label>
            <input class="input" id="nom" name="nom" type="text" maxlength="120" autocomplete="off" value="${escapeHtml(nomination.roaster)}">
          </div>
        </div>
        <div class="notice" id="rvMsg" role="status" aria-live="polite" hidden></div>
        <p class="rv-credit" id="rvCredit" role="status" aria-live="polite" hidden></p>
        <button class="btn btn--primary btn--block" type="submit" id="rvSubmit">Trimite</button>
      </div>
    </form>`;
  coffees.forEach((c) => paintStars(c.coffeeId));
  root.querySelector('#rvForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  root.querySelector('#nom').addEventListener('input', (e) => { nomination.roaster = e.target.value; nomination.sent = false; });
  root.querySelectorAll('.rv-card[data-cid]').forEach((card) => {
    const cid = card.dataset.cid;
    card.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => { state.get(cid).stars = Number(r.value); paintStars(cid); }));
    card.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      const s = state.get(cid).tags; const tag = b.dataset.tag;
      if (s.has(tag)) s.delete(tag); else s.add(tag);
      b.setAttribute('aria-pressed', String(s.has(tag)));
    }));
    card.querySelector('textarea').addEventListener('input', (e) => { state.get(cid).note = e.target.value; });
  });
}

function cardHTML(c) {
  const s = state.get(c.coffeeId);
  const id = escapeHtml(c.coffeeId);
  const stars = [1, 2, 3, 4, 5].map((n) => `
    <input type="radio" name="stars-${id}" id="st-${id}-${n}" value="${n}"${s.stars === n ? ' checked' : ''}>
    <label for="st-${id}-${n}" data-n="${n}"><span class="visually-hidden">${n} ${n === 1 ? 'stea' : 'stele'}</span>${STAR}</label>`).join('');
  return `
    <fieldset class="rv-card" data-cid="${id}">
      <legend><span class="rv-slot">${escapeHtml(c.slot)}${c.roaster ? ' · ' + escapeHtml(c.roaster) : ''}</span><span class="rv-name">${escapeHtml(c.name)}</span></legend>
      <div class="stars rv-stars" role="radiogroup" aria-label="Nota pentru ${escapeHtml(c.name)}">${stars}</div>
      <div class="rv-tags-label" id="tl-${id}">Ce ai simțit în ceașcă?</div>
      <div class="rv-chips" role="group" aria-labelledby="tl-${id}">
        ${TAGS.map((t) => `<button type="button" class="chip" data-tag="${t}" aria-pressed="${s.tags.has(t)}">${t}</button>`).join('')}
      </div>
      <div class="field">
        <label class="field__label" for="note-${id}">Notă (opțional)</label>
        <textarea class="textarea" id="note-${id}" rows="2" maxlength="500">${escapeHtml(s.note)}</textarea>
      </div>
    </fieldset>`;
}

function paintStars(cid) {
  const card = root.querySelector(`.rv-card[data-cid="${CSS.escape(cid)}"]`);
  if (!card) return;
  const n = state.get(cid).stars;
  card.querySelectorAll('.stars label').forEach((l) => l.classList.toggle('is-on', Number(l.dataset.n) <= n));
}

function say(el, text) { el.hidden = !text; el.textContent = text || ''; }

async function sendCredit(c) {
  if (credited.has(c.coffeeId)) return;
  credited.add(c.coffeeId);
  try {
    await fetch(`${WORKER}/review/credit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, boxId, coffeeId: c.coffeeId }),
    });
  } catch { /* best effort */ }
}

async function submit() {
  if (submitting) return;
  const msg = root.querySelector('#rvMsg');
  const creditEl = root.querySelector('#rvCredit');
  const btn = root.querySelector('#rvSubmit');
  const rated = coffees.filter((c) => state.get(c.coffeeId).stars >= 1);
  if (!rated.length) { say(msg, 'Alege cel puțin o notă, de la 1 la 5 stele.'); return; }
  submitting = true; pendingRetry = false; btn.disabled = true; say(msg, '');
  try {
    await Promise.all(rated.map((c) => {
      const s = state.get(c.coffeeId);
      return setDoc(doc(db, 'ratings', `${boxId}_${token}_${c.coffeeId}`), {
        boxId, coffeeId: c.coffeeId, token,
        subscriberId: tokenDoc.subscriberId, email: tokenDoc.email,
        stars: s.stars, tags: [...s.tags], note: s.note.trim(), createdAt: serverTimestamp(),
      });
    }));
    const roaster = nomination.roaster.trim();
    if (roaster && !nomination.sent) {
      await addDoc(collection(db, 'nominations'), { roaster, city: '', note: '', source: 'review', createdAt: serverTimestamp() });
      nomination.sent = true;
    }
  } catch (e) {
    submitting = false; btn.disabled = false; pendingRetry = true;
    say(msg, 'Nu s-a trimis. Ce ai completat a rămas aici; se retrimite singur când revine internetul, sau apasă din nou „Trimite”.');
    return;
  }
  const low = rated.filter((c) => state.get(c.coffeeId).stars <= 2);
  const needCredit = low.filter((c) => !credited.has(c.coffeeId));
  await Promise.all(needCredit.map(sendCredit));
  submitting = false; btn.disabled = false;
  done(low.length > 0);
}

function done(showCredit) {
  const credit = showCredit
    ? `<p class="rv-credit" role="status" aria-live="polite">Ne pare rău că cafeaua nu ți-a plăcut. Ai ${BOX_CONFIG.reviewCredit} lei reducere la următoarea cutie.</p>` : '';
  root.innerHTML = `
    <div class="rv-done" role="status" aria-live="polite">
      <h1>Mulțumim!</h1>
      <p>Notele tale au ajuns la noi.</p>
      ${credit}
      <a class="btn btn--primary" href="/account.html">Contul meu</a>
      <button class="btn btn--secondary" type="button" id="edit">Modifică notele</button>
    </div>`;
  root.querySelector('#edit').addEventListener('click', render);
}

window.addEventListener('online', () => { if (pendingRetry && !submitting) submit(); });

init();
