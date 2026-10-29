// Genus Coffee Box — customer account (/account.html). Data contract: handoff/docs/box-data.md.
import { renderBoxChrome, escapeHtml, formatMoney, userFetch, getPlans, monthKey, fmtDate, monthName, FREQ_LABEL, TIERS, BOX_CONFIG } from '/js/box/shared.js';
import {
  db, auth, doc, getDoc, getDocs, updateDoc, collection, query, where,
  onAuthStateChanged, signOut, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from '/js/firebase.js';

renderBoxChrome('account');

const root = document.getElementById('ac');
const EMAIL_KEY = 'genusEmailForSignIn';
const DAY = 86400000;
const STATUS_LABEL = { active: 'Activ', trialing: 'Activ', paused: 'Pauză', canceled: 'Anulat', past_due: 'Plată restantă', incomplete: 'În așteptare', unpaid: 'Neplătit' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

let user = null;
let sub = null;       // {id, ...data}
let live = null;      // GET /account/subscription
let box = null;
let coffeeMap = {};   // coffeeId -> coffee data
let plans = null;

const notice = (text, kind = 'status') => `<div class="notice" role="${kind === 'alert' ? 'alert' : 'status'}">${escapeHtml(text)}</div>`;
function flash(text, isError = false) {
  const el = root.querySelector('#acFlash');
  if (!el) return;
  el.innerHTML = text ? notice(text, isError ? 'alert' : 'status') : '';
}
// Wraps an action: button disabled while busy, Worker errors shown in a .notice.
async function act(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  flash('');
  try { await fn(); if (okMsg) flash(okMsg); }
  catch (e) { flash(e && e.message ? e.message : 'Ceva nu a mers, încearcă din nou.', true); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
}

/* ------------------------------------------------------------- sign-in */

function signInView(msg = '', email = '') {
  root.innerHTML = `
    <h1>Contul meu</h1>
    <section class="ac-card ac-signin" aria-labelledby="siH">
      <h2 id="siH">Intră în cont</h2>
      <p>Îți trimitem pe email un link de intrare. Fără parolă.</p>
      <form id="siForm" class="stack" novalidate>
        <div class="field">
          <label class="field__label" for="siEmail">Email</label>
          <input class="input" id="siEmail" type="email" autocomplete="email" required value="${escapeHtml(email)}">
        </div>
        <button class="btn btn--primary" type="submit">Trimite linkul</button>
      </form>
      <div id="siMsg" aria-live="polite">${msg}</div>
    </section>`;
  root.querySelector('#siForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = root.querySelector('#siEmail').value.trim().toLowerCase();
    const out = root.querySelector('#siMsg');
    if (!/^\S+@\S+\.\S+$/.test(val)) { out.innerHTML = notice('Scrie o adresă de email validă.', 'alert'); return; }
    const btn = e.submitter || root.querySelector('#siForm button');
    btn.disabled = true;
    try {
      await sendSignInLinkToEmail(auth, val, { url: location.origin + '/account.html', handleCodeInApp: true });
      lsSet(EMAIL_KEY, val);
      out.innerHTML = notice(`Am trimis linkul la ${val}. Verifică și folderul Spam.`);
    } catch (err) {
      out.innerHTML = notice('Nu am putut trimite linkul. Încearcă din nou.', 'alert');
    } finally { btn.disabled = false; }
  });
}

async function completeEmailLink() {
  let email = lsGet(EMAIL_KEY);
  if (!email) email = (window.prompt('Scrie emailul cu care ai cerut linkul') || '').trim().toLowerCase();
  if (!email) { signInView(notice('Ca să intri, scrie emailul și cere un link nou.', 'alert')); return false; }
  try {
    await signInWithEmailLink(auth, email, location.href);
    lsDel(EMAIL_KEY);
    history.replaceState(null, '', '/account.html');
    return true;
  } catch {
    history.replaceState(null, '', '/account.html');
    signInView(notice('Linkul nu mai e valabil. Cere unul nou.', 'alert'), email);
    return false;
  }
}

/* ------------------------------------------------------------- data */

async function loadAll() {
  root.innerHTML = '<p role="status">Se încarcă…</p>';
  const email = (user.email || '').toLowerCase();
  const snap = await getDocs(query(collection(db, 'subscribers'), where('email', '==', email)));
  if (snap.empty) {
    root.innerHTML = `
      <div class="ac-head"><h1>Contul meu</h1><button class="btn btn--secondary" type="button" id="out">Ieși din cont</button></div>
      <div class="ac-card">
        <p>Nu am găsit niciun abonament pentru ${escapeHtml(email)}.</p>
        <p>Dacă ai comandat cu alt email, intră cu acela.</p>
        <div class="ac-row"><a class="btn btn--primary" href="/box/quiz.html">Fă quiz-ul</a></div>
      </div>`;
    root.querySelector('#out').addEventListener('click', () => signOut(auth));
    return;
  }
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  sub = rows.find((r) => ['active', 'trialing', 'past_due', 'paused'].includes(r.status)) || rows[0];
  live = null;
  let liveErr = '';
  try { live = (await userFetch(user, '/account/subscription')).subscription || null; }
  catch (e) { liveErr = e.message; }
  try { plans = await getPlans(); } catch { plans = null; }

  box = null; coffeeMap = {};
  const periodEnd = (live && live.currentPeriodEnd) || sub.currentPeriodEnd;
  const billing = periodEnd ? new Date(periodEnd * 1000) : null;
  if (billing) {
    try {
      const b = await getDoc(doc(db, 'boxes', monthKey(billing)));
      if (b.exists() && b.data().published) box = { id: b.id, ...b.data() };
    } catch { /* box optional */ }
  }
  const ids = new Set();
  if (box) (box.coffees || []).forEach((c) => { ids.add(c.coffeeId); const a = (box.alternates || {})[c.coffeeId]; if (a) ids.add(a); });
  await Promise.all([...ids].map(async (id) => {
    try { const d = await getDoc(doc(db, 'coffees', id)); if (d.exists()) coffeeMap[id] = d.data(); } catch { /* ignore */ }
  }));
  let ratings = [];
  try {
    const rs = await getDocs(query(collection(db, 'ratings'), where('email', '==', email)));
    ratings = rs.docs.map((d) => d.data());
    const miss = [...new Set(ratings.map((r) => r.coffeeId))].filter((id) => !coffeeMap[id]);
    await Promise.all(miss.map(async (id) => {
      try { const d = await getDoc(doc(db, 'coffees', id)); if (d.exists()) coffeeMap[id] = d.data(); } catch { /* ignore */ }
    }));
  } catch { /* ratings optional */ }
  render({ billing, ratings, liveErr });
}

/* ------------------------------------------------------------- render */

const status = () => (live && live.status) || sub.status || '';
const cname = (id) => (coffeeMap[id] && coffeeMap[id].name) || id;
const stars = (n) => '<span class="ac-star" aria-hidden="true">' + '★'.repeat(n) + '☆'.repeat(5 - n) + `</span><span class="visually-hidden">${n} din 5 stele</span>`;

function render({ billing, ratings, liveErr }) {
  const st = status();
  const inactive = st === 'paused' || st === 'canceled';
  const planKey = (live && live.plan) || sub.plan;
  const tier = TIERS[planKey];
  const interval = (live && live.intervalCount) || sub.intervalCount || 1;
  const month = box ? box.id : (billing ? monthKey(billing) : '');
  const deadline = billing ? new Date(billing.getTime() - BOX_CONFIG.swapDeadlineDays * DAY) : null;
  const late = deadline ? Date.now() > deadline.getTime() : false;
  const skipped = (sub.skipMonths || []).includes(month) || !!(live && live.pauseResumesAt && st !== 'paused');
  const dis = late || inactive ? ' disabled' : '';
  const lateTitle = late ? ' title="Prea târziu pentru luna aceasta"' : '';
  const lateNote = late ? '<p class="ac-late">Prea târziu pentru luna aceasta</p>' : '';

  const mine = box ? (box.coffees || []).filter((c) => !c.tiers || !planKey || c.tiers.includes(planKey)) : [];
  const swaps = (sub.swaps && sub.swaps[month]) || {};
  const coffeeRows = mine.map((c) => {
    const alt = (box.alternates || {})[c.coffeeId];
    const swapped = swaps[c.coffeeId];
    const shown = swapped || c.coffeeId;
    const c0 = coffeeMap[shown] || {};
    const btn = alt && !swapped
      ? `<button class="btn btn--secondary btn--sm" type="button" data-swap="${escapeHtml(c.coffeeId)}"${dis}${lateTitle}>Schimbă cu ${escapeHtml(cname(alt))}</button>`
      : (swapped ? '<span class="mono">Schimbată</span>' : '');
    return `<li class="ac-coffee"><div><small>${escapeHtml(c.slot || '')}${c0.roasterName ? ' · ' + escapeHtml(c0.roasterName) : ''}</small><strong>${escapeHtml(cname(shown))}</strong></div>${btn}</li>`;
  }).join('');

  const nextBox = !billing ? '<p>Nu avem încă o dată de plată pentru abonamentul tău.</p>'
    : !box ? `<p>Cutia pentru ${escapeHtml(monthName(monthKey(billing)))} nu e anunțată încă. O vezi aici imediat ce o publicăm.</p>`
    : `
      <dl class="ac-dates">
        <div><dt>Livrare</dt><dd>${escapeHtml(fmtDate(box.deliveryDate) || '—')}</dd></div>
        <div><dt>Plata</dt><dd>${escapeHtml(fmtDate(billing.toISOString()))}</dd></div>
        <div><dt>Poți schimba până pe</dt><dd>${escapeHtml(fmtDate(deadline.toISOString()))}</dd></div>
      </dl>
      ${skipped ? '<div class="notice" role="status">Ai sărit peste luna aceasta.</div>' : ''}
      <ul class="ac-coffees">${coffeeRows}</ul>
      ${lateNote}
      <div class="ac-row">
        <button class="btn btn--secondary" type="button" id="skip"${dis}${lateTitle}>Sari peste luna aceasta</button>
      </div>
      <form id="lockerForm" class="ac-row" novalidate>
        <div class="field" style="flex:1;min-width:220px">
          <label class="field__label" for="locker">Easybox</label>
          <input class="input" id="locker" type="text" value="${escapeHtml(sub.locker || '')}" autocomplete="off">
        </div>
        <button class="btn btn--secondary" type="submit" style="align-self:flex-end">Schimbă easybox</button>
      </form>`;

  const subs = (plans && plans.subscriptions) || {};
  const boxOpts = Object.entries(subs).map(([k, p]) => `<option value="${escapeHtml(k)}"${k === planKey ? ' selected' : ''}>${escapeHtml(p.name || k)} — ${escapeHtml(formatMoney(p.price))}</option>`).join('');
  const panel = plans ? `
      <form id="planForm" class="stack" novalidate>
        <div class="field"><label class="field__label" for="planBox">Cutia</label><select class="select" id="planBox">${boxOpts}</select></div>
        <div class="field"><label class="field__label" for="planFreq">Frecvența</label><select class="select" id="planFreq"></select></div>
        <button class="btn btn--primary" type="submit"${inactive ? ' disabled' : ''}>Schimbă abonamentul</button>
        <p id="planNote" role="status" aria-live="polite" class="mono"></p>
      </form>` : notice('Nu am putut încărca prețurile acum. Reîncarcă pagina.', 'alert');

  const tp = sub.tasteProfile && typeof sub.tasteProfile === 'object' ? sub.tasteProfile : null;
  const tpItems = tp ? Object.values(tp).flat().filter((v) => v !== null && v !== '' && typeof v !== 'object').map((v) => `<li>${escapeHtml(String(v))}</li>`).join('') : '';

  const rated = ratings.slice().sort((a, b) => String(b.boxId).localeCompare(String(a.boxId))).map((r) => `
      <tr><td>${escapeHtml(cname(r.coffeeId))}</td><td>${stars(Number(r.stars) || 0)}</td><td>${escapeHtml(monthName(r.boxId))}</td>
      <td>${Number(r.stars) <= 2 ? `${BOX_CONFIG.reviewCredit} lei aplicat` : ''}</td></tr>`).join('');

  root.innerHTML = `
    <div class="ac-head">
      <div>
        <h1>Salut${sub.name ? ', ' + escapeHtml(String(sub.name).split(' ')[0]) : ''}</h1>
        <p class="mono">${escapeHtml(user.email || '')}</p>
      </div>
      <div class="ac-row">
        <span class="ac-pill${st === 'active' || st === 'trialing' ? '' : ' ac-pill--warn'}">${escapeHtml(STATUS_LABEL[st] || st || '—')}</span>
        ${inactive ? '<button class="btn btn--primary" type="button" id="react">Reactivează</button>' : ''}
        <button class="btn btn--ghost" type="button" id="out">Ieși din cont</button>
      </div>
    </div>
    <div id="acFlash" aria-live="polite">${liveErr ? notice('Nu am putut citi starea abonamentului: ' + liveErr, 'alert') : ''}</div>
    <section class="ac-card" aria-labelledby="nbH">
      <h2 id="nbH">Cutia următoare${box ? ' · ' + escapeHtml(monthName(box.id)) : ''}</h2>
      ${tier ? `<p class="mono">${escapeHtml(tier.name)} · ${escapeHtml(FREQ_LABEL[interval] || '')}</p>` : ''}
      ${nextBox}
    </section>
    <div class="ac-grid">
      <section class="ac-card" aria-labelledby="spH"><h2 id="spH">Abonamentul</h2>${panel}
        <button class="btn btn--secondary" type="button" id="portal">Card, facturi, pauză, anulare</button>
      </section>
      <section class="ac-card" aria-labelledby="tpH"><h2 id="tpH">Gusturile tale</h2>
        ${tpItems ? `<ul class="ac-taste">${tpItems}</ul>` : '<p>Nu avem încă un profil de gust.</p>'}
        <div class="ac-row"><a class="btn btn--secondary" href="/box/quiz.html">Refă quiz-ul</a></div>
      </section>
    </div>
    <section class="ac-card" aria-labelledby="rtH"><h2 id="rtH">Cafelele pe care le-ai notat</h2>
      ${rated ? `<div class="table-scroll"><table class="ac-ratings"><thead><tr><th scope="col">Cafea</th><th scope="col">Nota</th><th scope="col">Cutia</th><th scope="col"></th></tr></thead><tbody>${rated}</tbody></table></div>`
        : '<p>Nu ai notat nicio cafea încă. Linkul de notare e pe cardul din cutie.</p>'}
    </section>`;
  wire({ month });
}

function wire({ month }) {
  const $ = (s) => root.querySelector(s);
  $('#out').addEventListener('click', () => signOut(auth));
  $('#portal').addEventListener('click', (e) => act(e.currentTarget, async () => {
    const r = await userFetch(user, '/account/portal', {});
    if (!r.url) throw new Error('Nu am primit linkul către portal.');
    location.assign(r.url);
  }));
  const react = $('#react');
  if (react) react.addEventListener('click', (e) => act(e.currentTarget, async () => { await userFetch(user, '/account/reactivate', {}); await loadAll(); }));
  const skip = $('#skip');
  if (skip) skip.addEventListener('click', (e) => act(e.currentTarget, async () => { await userFetch(user, '/account/skip', {}); await loadAll(); }));
  root.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => act(b, async () => {
    const cid = b.dataset.swap;
    const alt = (box.alternates || {})[cid];
    if (!alt) return;
    await updateDoc(doc(db, 'subscribers', sub.id), { [`swaps.${month}.${cid}`]: alt });
    sub.swaps = { ...(sub.swaps || {}), [month]: { ...((sub.swaps || {})[month] || {}), [cid]: alt } };
    await loadAll();
  })));
  const lf = $('#lockerForm');
  if (lf) lf.addEventListener('submit', (e) => {
    e.preventDefault();
    const locker = $('#locker').value.trim();
    if (!locker) { flash('Scrie numele sau adresa easybox-ului.', true); return; }
    act(lf.querySelector('button'), async () => { await updateDoc(doc(db, 'subscribers', sub.id), { locker }); sub.locker = locker; }, 'Easybox-ul a fost schimbat.');
  });
  const pf = $('#planForm');
  if (pf) {
    const boxSel = $('#planBox'); const freqSel = $('#planFreq');
    const fillFreq = (keepVal) => {
      const p = plans.subscriptions[boxSel.value] || {};
      const cur = keepVal || String((live && live.intervalCount) || sub.intervalCount || 1);
      freqSel.innerHTML = (p.intervals || [1]).map((n) => `<option value="${n}"${String(n) === cur ? ' selected' : ''}>${escapeHtml(FREQ_LABEL[n] || n + ' luni')}</option>`).join('');
    };
    fillFreq();
    boxSel.addEventListener('change', () => fillFreq(freqSel.value));
    pf.addEventListener('submit', (e) => {
      e.preventDefault();
      act(pf.querySelector('button'), async () => {
        await userFetch(user, '/account/change', { plan: boxSel.value, interval_count: Number(freqSel.value) });
        $('#planNote').textContent = 'Se aplică de la următoarea plată.';
      });
    });
  }
}

/* ------------------------------------------------------------- boot */

if (!auth || !db) {
  root.innerHTML = notice('Contul nu e disponibil momentan. Încearcă mai târziu.', 'alert');
} else {
  let handled = false;
  const start = async (u) => {
    user = u;
    try { await loadAll(); }
    catch (e) { root.innerHTML = `<h1>Contul meu</h1>${notice('Nu am putut încărca contul: ' + (e.message || 'eroare necunoscută'), 'alert')}<button class="btn btn--secondary" type="button" id="out">Ieși din cont</button>`; root.querySelector('#out').addEventListener('click', () => signOut(auth)); }
  };
  onAuthStateChanged(auth, async (u) => {
    if (handled) { if (u) start(u); else { user = null; signInView(); } return; }
    handled = true;
    if (!u && isSignInWithEmailLink(auth, location.href)) {
      if (await completeEmailLink()) return; // onAuthStateChanged fires again with the user
      return;
    }
    if (u) start(u); else signInView();
  });
}
