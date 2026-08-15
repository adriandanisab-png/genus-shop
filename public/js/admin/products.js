// Admin › Products — CRUD over the Firestore `products` collection.
import { escapeHtml, originClass } from '../components.js';
import { db, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from '../firebase.js';
import { PRODUCTS, formatMoney } from '../data.js';

const ORIGINS = [
  ['', '— none —'], ['colombia', 'Colombia'], ['costarica', 'Costa Rica'],
  ['ethiopia', 'Ethiopia'], ['kenya', 'Kenya'], ['rwanda', 'Rwanda'],
];

let _panel = null;
let items = [];
let editing = null; // product object being edited, {} for new, or null

export async function render(panel) {
  _panel = panel;
  await load();
  editing = null;
  draw();
}

async function load() {
  const snap = await getDocs(collection(db, 'products'));
  items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)));
}

function draw() {
  if (!items.length && !editing) {
    _panel.innerHTML = `
      <div class="empty-state">
        <p style="margin-bottom:8px">No products in the database yet.</p>
        <p class="link-quiet" style="margin-bottom:22px">Import the 5 starter lots, then edit them — or add your own.</p>
        <button class="btn btn--primary" data-action="import" type="button">Import starter catalog</button>
        <button class="btn btn--secondary" data-action="new" type="button" style="margin-left:8px">Add product</button>
      </div>`;
    wire();
    return;
  }
  _panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--primary btn--sm" data-action="new" type="button">+ Add product</button>
      <span class="link-quiet">${items.length} product${items.length === 1 ? '' : 's'}</span>
    </div>
    ${editing ? formHTML(editing) : ''}
    <div class="product-rows">${items.map(rowHTML).join('')}</div>`;
  wire();
}

function rowHTML(p) {
  const badges = [
    p.available === false ? '<span class="status-pill status-declined">hidden</span>' : '',
    p.featured ? '<span class="status-pill status-contacted">featured</span>' : '',
  ].join(' ');
  return `
  <div class="product-row" data-id="${escapeHtml(p.id)}">
    <div class="product-row__thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : ''}</div>
    <div class="product-row__info">
      <div class="product-row__name">${escapeHtml(p.name || p.id)}</div>
      <div class="product-row__meta">${escapeHtml(p.originLabel || '')} ${badges}</div>
    </div>
    <div class="product-row__price mono">${p.price != null ? formatMoney(p.price) : '—'}</div>
    <div class="product-row__actions">
      <button class="btn btn--secondary btn--sm" data-action="edit" data-id="${escapeHtml(p.id)}" type="button">Edit</button>
      <button class="cart-remove" data-action="delete" data-id="${escapeHtml(p.id)}" type="button">Delete</button>
    </div>
  </div>`;
}

function field(label, name, value, opts = {}) {
  const { type = 'text', ph = '', step } = opts;
  return `<label class="field">
    <span class="field__label">${label}</span>
    <input class="input" name="${name}" type="${type}" ${step ? `step="${step}"` : ''} placeholder="${escapeHtml(ph)}" value="${escapeHtml(value ?? '')}">
  </label>`;
}

function formHTML(p) {
  const isNew = !p.id;
  return `
  <form class="panel product-form" data-action="save">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">${isNew ? 'New product' : 'Edit ' + escapeHtml(p.name || p.id)}</h3>
    <div class="form-grid">
      <label class="field">
        <span class="field__label">Product ID (slug)</span>
        <input class="input" name="id" value="${escapeHtml(p.id ?? '')}" placeholder="guji-uraga" ${isNew ? 'required' : 'readonly'}>
      </label>
      ${field('Name', 'name', p.name, { ph: 'Guji Uraga' })}
      <label class="field">
        <span class="field__label">Origin</span>
        <div class="select-wrap"><select class="select" name="origin">
          ${ORIGINS.map(([v, l]) => `<option value="${v}"${(p.origin || '') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </label>
      ${field('Origin label', 'originLabel', p.originLabel, { ph: 'Ethiopia · Guji' })}
      ${field('Region / process', 'region', p.region, { ph: '1900–2300m · Anaerobic natural' })}
      ${field('Tasting notes', 'notes', p.notes, { ph: 'Tropical fruit, citrus, sweetness' })}
      ${field('Price (lei)', 'price', p.price, { type: 'number', step: '1', ph: '89' })}
      ${field('Weight', 'weight', p.weight ?? '250g')}
      ${field('Roast', 'roast', p.roast ?? 'Omniroast')}
      ${field('Image URL / path', 'image', p.image, { ph: 'assets/reference/packaging-ethiopia.jpg' })}
      ${field('Sort order', 'sortOrder', p.sortOrder ?? 0, { type: 'number' })}
    </div>
    <div class="form-checks">
      <label class="check"><input type="checkbox" name="available" ${p.available !== false ? 'checked' : ''}> Available in shop</label>
      <label class="check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Featured on home</label>
    </div>
    <div class="notice" data-form-error hidden></div>
    <div class="form-actions">
      <button class="btn btn--primary" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
      <button class="btn btn--ghost btn--sm" data-action="cancel" type="button">Cancel</button>
    </div>
  </form>`;
}

function wire() {
  _panel.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.type === 'submit') return;
    const action = btn.dataset.action;
    if (action === 'new') { editing = { available: true }; draw(); scrollTop(); }
    else if (action === 'cancel') { editing = null; draw(); }
    else if (action === 'edit') { editing = items.find((p) => p.id === btn.dataset.id) || null; draw(); scrollTop(); }
    else if (action === 'delete') { await onDelete(btn.dataset.id); }
    else if (action === 'import') { await onImport(btn); }
  };
  const form = _panel.querySelector('form[data-action="save"]');
  if (form) form.onsubmit = onSave;
}

function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function onSave(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('[data-form-error]');
  const fd = new FormData(form);
  const id = String(fd.get('id') || '').trim();
  const price = Number(fd.get('price'));
  if (!id) return showErr(err, 'Product ID is required.');
  if (!fd.get('name')) return showErr(err, 'Name is required.');
  if (!Number.isFinite(price) || price <= 0) return showErr(err, 'Enter a valid price.');

  const data = {
    name: String(fd.get('name')).trim(),
    origin: String(fd.get('origin') || ''),
    originLabel: String(fd.get('originLabel') || '').trim(),
    region: String(fd.get('region') || '').trim(),
    notes: String(fd.get('notes') || '').trim(),
    price,
    weight: String(fd.get('weight') || '250g').trim(),
    roast: String(fd.get('roast') || 'Omniroast').trim(),
    image: String(fd.get('image') || '').trim(),
    sortOrder: Number(fd.get('sortOrder')) || 0,
    available: fd.get('available') === 'on',
    featured: fd.get('featured') === 'on',
    updatedAt: serverTimestamp(),
  };
  if (!items.find((p) => p.id === id)) data.createdAt = serverTimestamp();

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; submit.textContent = 'Saving…';
  try {
    await setDoc(doc(db, 'products', id), data, { merge: true });
    await load();
    editing = null;
    draw();
  } catch (e2) {
    showErr(err, e2.message || 'Save failed.');
    submit.disabled = false;
  }
}

async function onDelete(id) {
  if (!confirm(`Delete "${id}"? This can’t be undone.`)) return;
  await deleteDoc(doc(db, 'products', id));
  await load();
  draw();
}

async function onImport(btn) {
  btn.disabled = true; btn.textContent = 'Importing…';
  for (const p of PRODUCTS) {
    const { id, ...rest } = p;
    await setDoc(doc(db, 'products', id), { ...rest, available: true, featured: false, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  }
  await load();
  draw();
}

function showErr(el, msg) { if (el) { el.textContent = msg; el.hidden = false; } }
