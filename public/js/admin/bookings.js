// Admin › Bookings — event quote requests from Firestore.
import { escapeHtml } from '../components.js';
import { db, collection, getDocs, query, orderBy, doc, updateDoc } from '../firebase.js';

const STATUSES = ['new', 'contacted', 'booked', 'declined'];
let _panel = null;
let items = [];

export async function render(panel) {
  _panel = panel;
  await load();
  draw();
}

async function load() {
  const snap = await getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc')));
  items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function fmtDate(ts) {
  if (ts && typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return '—';
}
function statusPill(s) { s = escapeHtml(s || 'new'); return `<span class="status-pill status-${s}">${s}</span>`; }

function rowHTML(b) {
  const options = STATUSES.map((s) => `<option value="${s}"${(b.status || 'new') === s ? ' selected' : ''}>${s}</option>`).join('');
  return `
  <div class="record">
    <div class="record__head">
      <div class="record__title">${escapeHtml(b.name || 'Unnamed')} · ${escapeHtml(b.packageLabel || b.package || '')}</div>
      <div class="record__meta">${escapeHtml(b.date || '')} &nbsp;·&nbsp; sent ${fmtDate(b.createdAt)}</div>
    </div>
    <dl>
      <dt>Email</dt><dd><a href="mailto:${escapeHtml(b.email || '')}">${escapeHtml(b.email || '—')}</a></dd>
      <dt>Phone</dt><dd>${escapeHtml(b.phone || '—')}</dd>
      <dt>Guests</dt><dd>${b.guests != null ? escapeHtml(String(b.guests)) : '—'}</dd>
      <dt>Notes</dt><dd>${escapeHtml(b.message || '—')}</dd>
    </dl>
    <div class="record__actions">
      ${statusPill(b.status)}
      <div class="select-wrap"><select class="select" data-booking-status="${escapeHtml(b.id)}">${options}</select></div>
    </div>
  </div>`;
}

function draw() {
  _panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--secondary btn--sm" data-action="refresh" type="button">Refresh</button>
      <span class="link-quiet">${items.length} booking${items.length === 1 ? '' : 's'}</span>
    </div>
    ${items.length ? items.map(rowHTML).join('') : '<p class="empty-state">No event bookings yet.</p>'}`;
  _panel.querySelector('[data-action="refresh"]').onclick = async () => { await load(); draw(); };
  _panel.onchange = async (e) => {
    const sel = e.target.closest('[data-booking-status]');
    if (!sel) return;
    try { await updateDoc(doc(db, 'bookings', sel.dataset.bookingStatus), { status: sel.value }); }
    catch (err) { console.error('[admin] status update failed', err); }
  };
}
