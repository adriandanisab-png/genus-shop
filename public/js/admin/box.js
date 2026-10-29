// Admin › Box — monthly line-up, coffees/roasters, bag ordering, packing, ratings.
import { escapeHtml } from '../components.js';
import {
  db, collection, doc, getDocs, setDoc, deleteDoc, query, where, writeBatch, serverTimestamp,
} from '../firebase.js';

const SLOTS = ['INVITAT 1', 'INVITAT 2', 'CASA'];
const TIERS = ['duo', 'trio', 'reserve'];
const CYCLE = [
  { from: 1, to: 5, label: '1–5 pick' },
  { from: 5, to: 5, label: '5 billing' },
  { from: 10, to: 10, label: '10 order bags' },
  { from: 20, to: 20, label: '20 bags arrive' },
  { from: 21, to: 23, label: '21–23 pack' },
  { from: 22, to: 25, label: '22–25 ship' },
];

let _panel = null;
let month = nextMonth();
let S = null; // loaded state
let editCoffee = null;
let editRoaster = null;
let lineup = null; // working copy of the box doc

function nextMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const e = escapeHtml;
const list = (v) => (Array.isArray(v) ? v : []);
const csvList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export async function render(panel) {
  _panel = panel;
  editCoffee = null; editRoaster = null;
  await load();
  draw();
}

async function safeDocs(name, ...cons) {
  try {
    const snap = await getDocs(cons.length ? query(collection(db, name), ...cons) : collection(db, name));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[admin:box]', name, err);
    return [];
  }
}

async function load() {
  const [coffees, roasters, subs, boxes, ratings, nominations, waitlist, orders] = await Promise.all([
    safeDocs('coffees'), safeDocs('roasters'), safeDocs('subscribers'), safeDocs('boxes'),
    safeDocs('ratings'), safeDocs('nominations'), safeDocs('waitlist'), safeDocs('orders'),
  ]);
  S = { coffees, roasters, subs, boxes, ratings, nominations, waitlist, orders };
  const b = boxes.find((x) => x.id === month);
  lineup = b ? JSON.parse(JSON.stringify(b)) : { month, coffees: [], alternates: {}, published: false };
}

async function reloadMonth() { await load(); draw(); }

/* ---------- derived data ---------- */
const coffeeById = (id) => S.coffees.find((c) => c.id === id);
const isActive = (s) => ['active', 'trialing'].includes(s.status);
const isSkipping = (s) => list(s.skipMonths).includes(month) || s.status === 'paused';
const tsMonth = (t) => {
  const d = t?.toDate ? t.toDate() : t?.seconds ? new Date(t.seconds * 1000) : t ? new Date(t) : null;
  return d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '';
};

function subCoffees(s) {
  const swaps = (s.swaps && s.swaps[month]) || {};
  return list(lineup.coffees)
    .filter((c) => list(c.tiers).includes(String(s.plan || '').toLowerCase()))
    .map((c) => swaps[c.coffeeId] || c.coffeeId);
}
function shippable() { return S.subs.filter((s) => isActive(s) && !isSkipping(s)); }

function bagRows() {
  const counts = {};
  list(lineup.coffees).forEach((c) => { counts[c.coffeeId] = counts[c.coffeeId] || 0; });
  shippable().forEach((s) => subCoffees(s).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  return Object.entries(counts).map(([id, boxes]) => {
    const c = coffeeById(id) || {};
    const bags = boxes + (boxes ? Math.ceil(boxes / 20) : 0);
    return { id, roaster: c.roasterName || '', coffee: c.name || id, bags, price: c.bagPrice, roastBy: lineup.roastDate || c.roastDate || '' };
  }).sort((a, b) => a.roaster.localeCompare(b.roaster) || a.coffee.localeCompare(b.coffee));
}

/* ---------- drawing ---------- */
function draw() {
  _panel.innerHTML = `
    ${monthHTML()}
    ${kpiHTML()}
    ${lineupHTML()}
    ${bagsHTML()}
    ${packingHTML()}
    ${ratingsHTML()}
    ${coffeesHTML()}
    ${roastersHTML()}
    ${waitlistHTML()}`;
  wire();
}

function sectionTitle(t, extra = '') {
  return `<div class="admin-toolbar" style="margin-top:36px"><h3 style="font-family:var(--font-display);font-size:22px;margin:0">${t}</h3>${extra}</div>`;
}

function monthHTML() {
  const today = new Date().getDate();
  const current = month === new Date().toISOString().slice(0, 7) || month === nextMonth();
  const chips = CYCLE.map((c) => {
    const on = current && today >= c.from && today <= c.to;
    return `<span class="pill${on ? ' is-active' : ''}" style="display:inline-block;padding:6px 12px;border:1px solid var(--line,#ccc);border-radius:99px;font-size:13px;margin:0 6px 6px 0;${on ? 'background:var(--ink,#222);color:#fff' : ''}">${e(c.label)}</span>`;
  }).join('');
  return `
    <div class="admin-toolbar">
      <label class="field" style="margin:0"><span class="field__label">Month</span>
        <input class="input" type="month" data-month value="${e(month)}"></label>
      <span class="link-quiet">Box cycle · today is day ${today}</span>
    </div>
    <div style="margin-top:10px">${chips}</div>`;
}

function kpiHTML() {
  const subs = S.subs;
  const active = subs.filter(isActive).length;
  const skipping = subs.filter((s) => list(s.skipMonths).includes(month) || s.status === 'paused').length;
  const swaps = subs.reduce((n, s) => n + Object.keys((s.swaps && s.swaps[month]) || {}).length, 0);
  const canceled = subs.filter((s) => s.status === 'canceled').length;
  const oneOff = S.orders.filter((o) => o.metadata && o.metadata.box && tsMonth(o.createdAt) === month).length;
  const card = (n, l) => `<div class="panel" style="padding:16px"><div style="font-family:var(--font-display);font-size:30px">${n}</div><div class="link-quiet">${l}</div></div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:18px">
    ${card(active, 'Active subscribers')}${card(skipping, 'Paused / skipping')}${card(swaps, 'Swaps this month')}
    ${card(canceled, 'Cancellations')}${card(oneOff, 'Gift &amp; one-off orders')}</div>`;
}

function coffeeOptions(sel, withBlank) {
  return (withBlank ? '<option value="">—</option>' : '') + S.coffees
    .map((c) => `<option value="${e(c.id)}"${c.id === sel ? ' selected' : ''}>${e(c.name || c.id)}${c.roasterName ? ' — ' + e(c.roasterName) : ''}</option>`).join('');
}

function lineupHTML() {
  const L = lineup;
  const rows = list(L.coffees).map((c, i) => `
    <div class="record" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 0">
      <select class="input" data-lu="coffeeId" data-i="${i}" style="flex:2;min-width:180px">${coffeeOptions(c.coffeeId)}</select>
      <select class="input" data-lu="slot" data-i="${i}" style="flex:1;min-width:110px">${SLOTS.map((s) => `<option${s === c.slot ? ' selected' : ''}>${s}</option>`).join('')}</select>
      ${TIERS.map((t) => `<label style="font-size:13px"><input type="checkbox" data-lu="tier" data-t="${t}" data-i="${i}"${list(c.tiers).includes(t) ? ' checked' : ''}> ${t}</label>`).join('')}
      <select class="input" data-lu="alt" data-i="${i}" style="flex:2;min-width:160px" title="Alternate">${coffeeOptions((L.alternates || {})[c.coffeeId], true)}</select>
      <button class="cart-remove" data-action="lu-remove" data-i="${i}" type="button">Remove</button>
    </div>`).join('');
  const f = (label, name, type = 'text') => `<label class="field"><span class="field__label">${label}</span><input class="input" type="${type}" data-lf="${name}" value="${e(L[name] ?? '')}"></label>`;
  return `
    ${sectionTitle('Line-up · ' + e(month))}
    <form class="panel product-form" data-form="lineup">
      <div class="form-grid">
        ${f('Theme', 'theme')}
        ${f('Billing date', 'billingDate', 'date')}${f('Roast date', 'roastDate', 'date')}
        ${f('Delivery date', 'deliveryDate', 'date')}${f('Announce date', 'announceDate', 'date')}
      </div>
      <label class="field" style="margin-top:12px"><span class="field__label">Intro</span>
        <textarea class="textarea" data-lf="intro">${e(L.intro ?? '')}</textarea></label>
      <label style="display:block;margin:12px 0"><input type="checkbox" data-lf="published"${L.published ? ' checked' : ''}> Published</label>
      <div class="link-quiet" style="margin-bottom:6px">Coffees (slot · tiers · alternate)</div>
      ${rows || '<p class="empty-state">No coffees in this line-up yet.</p>'}
      <div class="form-actions" style="margin-top:14px">
        <button class="btn btn--secondary btn--sm" data-action="lu-add" type="button"${S.coffees.length ? '' : ' disabled'}>+ Add coffee</button>
        <button class="btn btn--primary" type="submit">Save line-up</button>
        <span class="link-quiet" data-lu-msg></span>
      </div>
    </form>`;
}

function bagsHTML() {
  const rows = bagRows();
  const body = rows.length ? `<div style="overflow-x:auto"><table class="admin-table" style="width:100%;border-collapse:collapse">
    <thead><tr style="text-align:left"><th>Roaster</th><th>Coffee</th><th>Bags</th><th>Price / bag</th><th>Roast-by</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${e(r.roaster)}</td><td>${e(r.coffee)}</td><td>${r.bags}</td><td>${r.price != null ? e(r.price) + ' lei' : '—'}</td><td>${e(r.roastBy || '—')}</td><td>${e(statusFor())}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty-state">Add coffees to the line-up to see bag counts.</p>';
  return `${sectionTitle('Bags to order', `<button class="btn btn--secondary btn--sm" data-action="export-bags" type="button"${rows.length ? '' : ' disabled'}>Export order sheet</button>`)}
    <div class="panel">${body}<p class="link-quiet" style="margin-top:10px">Bags = active boxes with that coffee (after swaps, minus skips) + 1 spare per 20 boxes.</p></div>`;
}
function statusFor() {
  const d = new Date().getDate();
  return month === nextMonth() && d < 10 ? 'To order on the 10th' : 'To order';
}

function packingRows() {
  return shippable().map((s) => ({ s, ids: subCoffees(s) })).filter((r) => r.ids.length);
}
function packingHTML() {
  const rows = packingRows();
  const body = rows.length ? `<div style="overflow-x:auto"><table class="admin-table" style="width:100%;border-collapse:collapse">
    <thead><tr style="text-align:left"><th>Name</th><th>Locker</th><th>Plan</th><th>Coffees</th></tr></thead>
    <tbody>${rows.map(({ s, ids }) => `<tr><td>${e(s.name || s.email)}</td><td>${e(s.locker || '—')}</td><td>${e(s.plan || '')}</td><td>${ids.map((i) => e((coffeeById(i) || {}).name || i)).join(', ')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty-state">No boxes to pack for this month.</p>';
  return `${sectionTitle('Packing list · ' + rows.length + ' boxes', `<button class="btn btn--secondary btn--sm" data-action="print" type="button"${rows.length ? '' : ' disabled'}>Print labels &amp; cards</button>`)}<div class="panel">${body}</div>`;
}

function ratingsOfMonth() { return S.ratings.filter((r) => r.boxId === month); }
function ratingsHTML() {
  const rs = ratingsOfMonth();
  const tokens = new Set(rs.map((r) => r.token));
  const sent = shippable().length;
  const avg = rs.length ? (rs.reduce((n, r) => n + (r.stars || 0), 0) / rs.length).toFixed(1) : '—';
  const low = rs.filter((r) => r.stars <= 2).length;
  const rate = sent ? Math.round((tokens.size / sent) * 100) + '%' : '—';
  const card = (n, l) => `<div class="panel" style="padding:16px"><div style="font-family:var(--font-display);font-size:26px">${n}</div><div class="link-quiet">${l}</div></div>`;
  const noms = S.nominations.length ? S.nominations.map((n) => `<div class="record" style="padding:8px 0"><strong>${e(n.roaster)}</strong> ${n.city ? '· ' + e(n.city) : ''} <span class="link-quiet">${e(n.source || '')}</span><div>${e(n.note || '')}</div></div>`).join('') : '<p class="empty-state">No nominations yet.</p>';
  return `${sectionTitle('Ratings · ' + e(month), '<button class="btn btn--secondary btn--sm" data-action="recompute" type="button">Recompute ranking</button><span class="link-quiet" data-rank-msg></span>')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      ${card(rate, `Response rate (${tokens.size} / ${sent})`)}${card(avg, 'Average stars')}${card(low, '1–2★ (credits)')}</div>
    <div class="panel" style="margin-top:12px"><h4 style="margin:0 0 8px">Nominations</h4>${noms}</div>`;
}

function coffeesHTML() {
  const f = editCoffee;
  const rows = S.coffees.length ? S.coffees.map((c) => `
    <div class="product-row"><div class="product-row__info"><div class="product-row__name">${e(c.name || c.id)}</div>
      <div class="product-row__meta">${[c.roasterName, c.origin, c.tier, c.bagPrice != null ? c.bagPrice + ' lei/bag' : ''].filter(Boolean).map(e).join(' · ')}</div></div><div></div>
      <div class="product-row__actions"><button class="btn btn--secondary btn--sm" data-action="coffee-edit" data-id="${e(c.id)}" type="button">Edit</button>
      <button class="cart-remove" data-action="coffee-del" data-id="${e(c.id)}" type="button">Delete</button></div></div>`).join('')
    : '<p class="empty-state">No coffees yet.</p>';
  return `${sectionTitle('Coffees', '<button class="btn btn--primary btn--sm" data-action="coffee-new" type="button">+ Add coffee</button>')}
    ${f ? coffeeForm(f) : ''}<div class="product-rows">${rows}</div>`;
}
function coffeeForm(c) {
  const isNew = !c.id;
  const t = (label, name, val, type = 'text') => `<label class="field"><span class="field__label">${label}</span><input class="input" name="${name}" type="${type}" value="${e(val ?? '')}"></label>`;
  return `<form class="panel product-form" data-form="coffee"><div class="form-grid">
    <label class="field"><span class="field__label">ID (slug)</span><input class="input" name="id" value="${e(c.id ?? '')}" ${isNew ? 'required' : 'readonly'}></label>
    ${t('Name', 'name', c.name)}
    <label class="field"><span class="field__label">Roaster</span><select class="input" name="roasterId"><option value="">—</option>${S.roasters.map((r) => `<option value="${e(r.id)}"${r.id === c.roasterId ? ' selected' : ''}>${e(r.name || r.id)}</option>`).join('')}</select></label>
    ${t('City', 'city', c.city)}${t('Origin', 'origin', c.origin)}${t('Process', 'process', c.process)}${t('Altitude', 'altitude', c.altitude)}
    ${t('Roast level', 'roastLevel', c.roastLevel)}${t('Roast date', 'roastDate', c.roastDate, 'date')}
    ${t('Notes (comma separated)', 'notes', list(c.notes).join(', '))}${t('Good for', 'goodFor', c.goodFor)}
    ${t('Methods (comma separated: filtru, espresso)', 'methods', list(c.methods).join(', '))}
    <label class="field"><span class="field__label">Tier colour</span><select class="input" name="tier">${['', ...TIERS].map((x) => `<option${x === (c.tier || '') ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    ${t('Retail price (lei)', 'retailPrice', c.retailPrice, 'number')}${t('Bag price (lei, wholesale)', 'bagPrice', c.bagPrice, 'number')}
    </div><div class="notice" data-form-error hidden style="margin-top:12px"></div>
    <div class="form-actions" style="margin-top:14px"><button class="btn btn--primary" type="submit">${isNew ? 'Create' : 'Save changes'}</button>
    <button class="btn btn--ghost btn--sm" data-action="cancel-forms" type="button">Cancel</button></div></form>`;
}

function roastersHTML() {
  const rows = S.roasters.length ? S.roasters.map((r) => `
    <div class="product-row"><div class="product-row__info"><div class="product-row__name">${e(r.name || r.id)}</div>
      <div class="product-row__meta">${[r.city, r.public ? 'Public' : 'Hidden'].filter(Boolean).map(e).join(' · ')}</div></div><div></div>
      <div class="product-row__actions"><button class="btn btn--secondary btn--sm" data-action="roaster-edit" data-id="${e(r.id)}" type="button">Edit</button>
      <button class="cart-remove" data-action="roaster-del" data-id="${e(r.id)}" type="button">Delete</button></div></div>`).join('')
    : '<p class="empty-state">No roasters yet.</p>';
  return `${sectionTitle('Roasters', '<button class="btn btn--primary btn--sm" data-action="roaster-new" type="button">+ Add roaster</button>')}
    ${editRoaster ? roasterForm(editRoaster) : ''}<div class="product-rows">${rows}</div>`;
}
function roasterForm(r) {
  const isNew = !r.id;
  const t = (label, name, val) => `<label class="field"><span class="field__label">${label}</span><input class="input" name="${name}" value="${e(val ?? '')}"></label>`;
  return `<form class="panel product-form" data-form="roaster"><div class="form-grid">
    <label class="field"><span class="field__label">ID (slug)</span><input class="input" name="id" value="${e(r.id ?? '')}" ${isNew ? 'required' : 'readonly'}></label>
    ${t('Name', 'name', r.name)}${t('City', 'city', r.city)}${t('Logo URL', 'logo', r.logo)}${t('Shop URL', 'shopUrl', r.shopUrl)}
    ${t('Months featured (comma separated YYYY-MM)', 'monthsFeatured', list(r.monthsFeatured).join(', '))}</div>
    <label class="field" style="margin-top:12px"><span class="field__label">Story</span><textarea class="textarea" name="story">${e(r.story ?? '')}</textarea></label>
    <label style="display:block;margin:12px 0"><input type="checkbox" name="public"${r.public ? ' checked' : ''}> Signed &amp; agreed — show publicly</label>
    <div class="notice" data-form-error hidden></div>
    <div class="form-actions"><button class="btn btn--primary" type="submit">${isNew ? 'Create' : 'Save changes'}</button>
    <button class="btn btn--ghost btn--sm" data-action="cancel-forms" type="button">Cancel</button></div></form>`;
}

function waitlistHTML() {
  return `${sectionTitle('Waitlist', `<button class="btn btn--secondary btn--sm" data-action="export-wait" type="button"${S.waitlist.length ? '' : ' disabled'}>Export CSV</button>`)}
    <div class="panel">${S.waitlist.length ? `<strong>${S.waitlist.length}</strong> people on the waitlist.` : '<p class="empty-state">Nobody on the waitlist yet.</p>'}</div>`;
}

/* ---------- events ---------- */
function wire() {
  _panel.onchange = (ev) => {
    const t = ev.target;
    if (t.matches('[data-month]')) { if (t.value) { month = t.value; reloadMonth(); } return; }
    if (t.dataset.lf) { lineup[t.dataset.lf] = t.type === 'checkbox' ? t.checked : t.value; return; }
    if (t.dataset.lu) {
      const i = Number(t.dataset.i); const c = lineup.coffees[i];
      if (t.dataset.lu === 'coffeeId') {
        const old = c.coffeeId; const alt = (lineup.alternates || {})[old];
        c.coffeeId = t.value;
        if (alt) { delete lineup.alternates[old]; lineup.alternates[t.value] = alt; }
      } else if (t.dataset.lu === 'slot') c.slot = t.value;
      else if (t.dataset.lu === 'tier') {
        const set = new Set(list(c.tiers)); t.checked ? set.add(t.dataset.t) : set.delete(t.dataset.t);
        c.tiers = TIERS.filter((x) => set.has(x));
      } else if (t.dataset.lu === 'alt') {
        lineup.alternates = lineup.alternates || {};
        if (t.value) lineup.alternates[c.coffeeId] = t.value; else delete lineup.alternates[c.coffeeId];
      }
    }
  };
  _panel.onclick = async (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b || b.type === 'submit') return;
    const a = b.dataset.action; const id = b.dataset.id;
    if (a === 'lu-add') { lineup.coffees = list(lineup.coffees); lineup.coffees.push({ coffeeId: S.coffees[0].id, slot: 'INVITAT 1', tiers: [...TIERS] }); draw(); }
    else if (a === 'lu-remove') { const i = Number(b.dataset.i); const c = lineup.coffees[i]; if (lineup.alternates) delete lineup.alternates[c.coffeeId]; lineup.coffees.splice(i, 1); draw(); }
    else if (a === 'export-bags') exportBags();
    else if (a === 'export-wait') exportWait();
    else if (a === 'print') printCards();
    else if (a === 'recompute') await recompute(b);
    else if (a === 'coffee-new') { editCoffee = {}; draw(); }
    else if (a === 'coffee-edit') { editCoffee = S.coffees.find((c) => c.id === id); draw(); }
    else if (a === 'coffee-del') { if (confirm(`Delete coffee "${id}"?`)) { await deleteDoc(doc(db, 'coffees', id)); await reloadMonth(); } }
    else if (a === 'roaster-new') { editRoaster = {}; draw(); }
    else if (a === 'roaster-edit') { editRoaster = S.roasters.find((r) => r.id === id); draw(); }
    else if (a === 'roaster-del') { if (confirm(`Delete roaster "${id}"?`)) { await deleteDoc(doc(db, 'roasters', id)); await reloadMonth(); } }
    else if (a === 'cancel-forms') { editCoffee = null; editRoaster = null; draw(); }
  };
  _panel.onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.target; const kind = form.dataset.form;
    const err = form.querySelector('[data-form-error]');
    try {
      if (kind === 'lineup') {
        const msg = form.querySelector('[data-lu-msg]');
        const data = {
          month, theme: lineup.theme || '', intro: lineup.intro || '',
          billingDate: lineup.billingDate || '', roastDate: lineup.roastDate || '',
          deliveryDate: lineup.deliveryDate || '', announceDate: lineup.announceDate || '',
          published: !!lineup.published,
          coffees: list(lineup.coffees).map((c) => ({ coffeeId: c.coffeeId, slot: c.slot, tiers: list(c.tiers) })),
          alternates: lineup.alternates || {},
        };
        await setDoc(doc(db, 'boxes', month), data);
        msg.textContent = 'Saved.';
        S.boxes = S.boxes.filter((x) => x.id !== month).concat({ id: month, ...data });
        return;
      }
      const fd = new FormData(form);
      const id = String(fd.get('id') || '').trim();
      if (!id) throw new Error('ID is required.');
      if (kind === 'coffee') {
        const r = S.roasters.find((x) => x.id === fd.get('roasterId'));
        const data = {
          name: String(fd.get('name') || '').trim(), roasterId: fd.get('roasterId') || '',
          roasterName: r ? r.name : (coffeeById(id) || {}).roasterName || '',
          city: fd.get('city') || (r && r.city) || '', origin: fd.get('origin') || '', process: fd.get('process') || '',
          altitude: fd.get('altitude') || '', roastLevel: fd.get('roastLevel') || '', roastDate: fd.get('roastDate') || '',
          notes: csvList(fd.get('notes')), goodFor: fd.get('goodFor') || '', methods: csvList(fd.get('methods')),
          tier: fd.get('tier') || '', retailPrice: num(fd.get('retailPrice')), bagPrice: num(fd.get('bagPrice')),
        };
        if (!data.name) throw new Error('Name is required.');
        await setDoc(doc(db, 'coffees', id), data, { merge: true });
        editCoffee = null;
      } else {
        const data = {
          name: String(fd.get('name') || '').trim(), city: fd.get('city') || '', story: fd.get('story') || '',
          logo: fd.get('logo') || '', shopUrl: fd.get('shopUrl') || '',
          monthsFeatured: csvList(fd.get('monthsFeatured')), public: fd.get('public') === 'on',
        };
        if (!data.name) throw new Error('Name is required.');
        await setDoc(doc(db, 'roasters', id), data, { merge: true });
        editRoaster = null;
      }
      await reloadMonth();
    } catch (x) {
      if (err) { err.textContent = x.message || 'Save failed.'; err.hidden = false; }
      else alert(x.message || 'Save failed.');
    }
  };
}

/* ---------- exports / print / ranking ---------- */
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function download(name, rows) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportBags() {
  download(`box-order-${month}.csv`, [['Roaster', 'Coffee', 'Bags', 'Price per bag', 'Roast by', 'Status'],
    ...bagRows().map((r) => [r.roaster, r.coffee, r.bags, r.price ?? '', r.roastBy, statusFor()])]);
}
function exportWait() {
  const ts = (t) => (t?.toDate ? t.toDate().toISOString() : t?.seconds ? new Date(t.seconds * 1000).toISOString() : '');
  download('waitlist.csv', [['Email', 'Source', 'Created'], ...S.waitlist.map((w) => [w.email, w.source, ts(w.createdAt)])]);
}

function printCards() {
  const rows = packingRows();
  const cards = rows.map(({ s, ids }) => ids.map((id) => {
    const c = coffeeById(id) || {};
    const url = `${location.origin}/box/review.html?b=${encodeURIComponent(month)}&t=${encodeURIComponent(s.reviewToken || '')}`;
    return `<section class="card">
      <div class="who">${e(s.name || s.email)} · ${e(s.locker || '')}</div>
      <h2>${e(c.name || id)}</h2>
      <div class="r">${e(c.roasterName || '')}${c.city ? ' · ' + e(c.city) : ''}</div>
      <p>${[c.origin, c.process, c.roastLevel].filter(Boolean).map(e).join(' · ')}</p>
      <p>${list(c.notes).map(e).join(', ')}</p>
      <p class="d">${c.roastDate || lineup.roastDate ? 'Roasted ' + e(c.roastDate || lineup.roastDate) : ''}</p>
      <p class="u">Rate this coffee:<br>${e(url)}</p></section>`;
  }).join('')).join('');
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cards ${e(month)}</title><style>
    body{font-family:Georgia,serif;margin:0}.card{box-sizing:border-box;width:100mm;height:140mm;padding:10mm;border:1px dashed #999;page-break-after:always;overflow:hidden}
    h2{font-size:22pt;margin:8mm 0 2mm}.who{font:9pt sans-serif;color:#555}.r{font:11pt sans-serif}.u{font:8pt sans-serif;word-break:break-all;margin-top:8mm}.d{font:9pt sans-serif}
    @media print{.card{border:none}}</style></head><body>${cards}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

async function recompute(btn) {
  const msg = _panel.querySelector('[data-rank-msg]');
  btn.disabled = true; msg.textContent = ' Computing…';
  try {
    const all = await safeDocs('ratings');
    const agg = {};
    all.forEach((r) => {
      if (!r.coffeeId || !r.stars) return;
      const a = agg[r.coffeeId] || (agg[r.coffeeId] = { sum: 0, n: 0 });
      a.sum += Number(r.stars); a.n++;
    });
    const ids = Object.keys(agg);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach((id) => {
        const c = coffeeById(id) || {};
        batch.set(doc(db, 'rankings', id), {
          kind: 'coffee', coffeeName: c.name || id, roasterName: c.roasterName || '', city: c.city || '',
          notes: list(c.notes), methods: list(c.methods),
          avg: Math.round((agg[id].sum / agg[id].n) * 10) / 10, count: agg[id].n,
        });
      });
      await batch.commit();
    }
    msg.textContent = ` Updated ${ids.length} coffee${ids.length === 1 ? '' : 's'}.`;
  } catch (x) {
    msg.textContent = ' Failed: ' + (x.message || x);
  }
  btn.disabled = false;
}
