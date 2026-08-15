// Admin › Past events — CRUD over the Firestore `pastEvents` collection.
import { escapeHtml } from '../components.js';
import { db, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from '../firebase.js';
import { PAST_EVENTS } from '../data.js';

let _panel = null;
let items = [];
let editing = null; // event object being edited, {} for new, or null

export async function render(panel) {
  _panel = panel;
  await load();
  editing = null;
  draw();
}

async function load() {
  const snap = await getDocs(collection(db, 'pastEvents'));
  items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function draw() {
  if (!items.length && !editing) {
    _panel.innerHTML = `
      <div class="empty-state">
        <p style="margin-bottom:8px">No past events yet.</p>
        <p class="link-quiet" style="margin-bottom:22px">Import the 3 placeholders, then edit — or add your own with photos from Instagram.</p>
        <button class="btn btn--primary" data-action="import" type="button">Import placeholders</button>
        <button class="btn btn--secondary" data-action="new" type="button" style="margin-left:8px">Add event</button>
      </div>`;
    wire();
    return;
  }
  _panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--primary btn--sm" data-action="new" type="button">+ Add event</button>
      <span class="link-quiet">${items.length} past event${items.length === 1 ? '' : 's'}</span>
    </div>
    ${editing ? formHTML(editing) : ''}
    <div class="product-rows">${items.map(rowHTML).join('')}</div>`;
  wire();
}

function rowHTML(e) {
  const meta = [e.date, e.location].filter(Boolean).map(escapeHtml).join(' · ');
  return `
  <div class="product-row" data-id="${escapeHtml(e.id)}">
    <div class="product-row__thumb">${e.image ? `<img src="${escapeHtml(e.image)}" alt="">` : ''}</div>
    <div class="product-row__info">
      <div class="product-row__name">${escapeHtml(e.title || e.id)}</div>
      <div class="product-row__meta">${meta}</div>
    </div>
    <div></div>
    <div class="product-row__actions">
      <button class="btn btn--secondary btn--sm" data-action="edit" data-id="${escapeHtml(e.id)}" type="button">Edit</button>
      <button class="cart-remove" data-action="delete" data-id="${escapeHtml(e.id)}" type="button">Delete</button>
    </div>
  </div>`;
}

function field(label, name, value, opts = {}) {
  const { type = 'text', ph = '' } = opts;
  return `<label class="field">
    <span class="field__label">${label}</span>
    <input class="input" name="${name}" type="${type}" placeholder="${escapeHtml(ph)}" value="${escapeHtml(value ?? '')}">
  </label>`;
}

function formHTML(e) {
  const isNew = !e.id;
  return `
  <form class="panel product-form" data-action="save">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">${isNew ? 'New past event' : 'Edit ' + escapeHtml(e.title || e.id)}</h3>
    <div class="form-grid">
      <label class="field">
        <span class="field__label">ID (slug)</span>
        <input class="input" name="id" value="${escapeHtml(e.id ?? '')}" placeholder="wedding-june-2026" ${isNew ? 'required' : 'readonly'}>
      </label>
      ${field('Title', 'title', e.title, { ph: 'A summer wedding' })}
      ${field('Date', 'date', e.date, { ph: 'June 2026' })}
      ${field('Location', 'location', e.location, { ph: 'near Oradea' })}
      ${field('Image URL / path', 'image', e.image, { ph: 'https://… or assets/reference/…' })}
      ${field('Sort order', 'sortOrder', e.sortOrder ?? 0, { type: 'number' })}
    </div>
    <label class="field" style="margin-top:16px">
      <span class="field__label">Short blurb</span>
      <textarea class="textarea" name="blurb" placeholder="150 guests, flat whites till midnight.">${escapeHtml(e.blurb ?? '')}</textarea>
    </label>
    <div class="notice" data-form-error hidden style="margin-top:14px"></div>
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn--primary" type="submit">${isNew ? 'Create' : 'Save changes'}</button>
      <button class="btn btn--ghost btn--sm" data-action="cancel" type="button">Cancel</button>
    </div>
  </form>`;
}

function wire() {
  _panel.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.type === 'submit') return;
    const action = btn.dataset.action;
    if (action === 'new') { editing = { sortOrder: items.length + 1 }; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (action === 'cancel') { editing = null; draw(); }
    else if (action === 'edit') { editing = items.find((x) => x.id === btn.dataset.id) || null; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (action === 'delete') { await onDelete(btn.dataset.id); }
    else if (action === 'import') { await onImport(btn); }
  };
  const form = _panel.querySelector('form[data-action="save"]');
  if (form) form.onsubmit = onSave;
}

async function onSave(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('[data-form-error]');
  const fd = new FormData(form);
  const id = String(fd.get('id') || '').trim();
  if (!id) { err.textContent = 'ID is required.'; err.hidden = false; return; }
  if (!fd.get('title')) { err.textContent = 'Title is required.'; err.hidden = false; return; }

  const data = {
    title: String(fd.get('title')).trim(),
    date: String(fd.get('date') || '').trim(),
    location: String(fd.get('location') || '').trim(),
    blurb: String(fd.get('blurb') || '').trim(),
    image: String(fd.get('image') || '').trim(),
    sortOrder: Number(fd.get('sortOrder')) || 0,
    updatedAt: serverTimestamp(),
  };
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; submit.textContent = 'Saving…';
  try {
    await setDoc(doc(db, 'pastEvents', id), data, { merge: true });
    await load();
    editing = null;
    draw();
  } catch (e2) {
    err.textContent = e2.message || 'Save failed.';
    err.hidden = false;
    submit.disabled = false;
  }
}

async function onDelete(id) {
  if (!confirm(`Delete "${id}"?`)) return;
  await deleteDoc(doc(db, 'pastEvents', id));
  await load();
  draw();
}

async function onImport(btn) {
  btn.disabled = true; btn.textContent = 'Importing…';
  for (const e of PAST_EVENTS) {
    const { id, ...rest } = e;
    await setDoc(doc(db, 'pastEvents', id), { ...rest, updatedAt: serverTimestamp() }, { merge: true });
  }
  await load();
  draw();
}
