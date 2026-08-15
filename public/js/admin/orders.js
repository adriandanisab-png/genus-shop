// Admin › Orders — reads paid orders from Firestore (written by the Worker's
// Stripe webhook), so it doesn't depend on the live Stripe API.
import { escapeHtml } from '../components.js';
import { db, collection, getDocs, query, orderBy } from '../firebase.js';
import { fmtMinor, errBox } from './api.js';

function fmtDate(ts) {
  if (ts && typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return '—';
}

export async function render(panel) {
  panel.innerHTML = '<p class="empty-state">Loading orders…</p>';
  let orders = [];
  try {
    const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    panel.innerHTML = errBox('orders', e.message);
    return;
  }

  panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--secondary btn--sm" data-refresh type="button">Refresh</button>
      <span class="link-quiet">${orders.length} order${orders.length === 1 ? '' : 's'}</span>
      <a class="link-quiet" href="https://dashboard.stripe.com/test/payments" target="_blank" rel="noopener" style="margin-left:auto">Full history in Stripe →</a>
    </div>
    ${orders.length ? orders.map(rowHTML).join('')
      : `<p class="empty-state">No orders recorded yet.<br><span class="link-quiet">Paid orders appear here once the Stripe webhook is set up (see SETUP.md).</span></p>`}`;
  panel.querySelector('[data-refresh]').onclick = () => render(panel);
}

function rowHTML(o) {
  const items = (o.items || [])
    .map((li) => `${escapeHtml(String(li.quantity))}× ${escapeHtml(li.description || '')}`)
    .join('<br>') || '—';
  const kind = o.mode === 'subscription' ? ' <span class="status-pill status-active">subscription</span>' : '';
  return `
  <div class="record">
    <div class="record__head">
      <div class="record__title">${escapeHtml(o.name || o.email || 'Order')} · ${fmtMinor(o.amount, o.currency)}${kind}</div>
      <div class="record__meta">${fmtDate(o.createdAt)} &nbsp;·&nbsp; <span class="status-pill status-paid">${escapeHtml(o.status || 'paid')}</span></div>
    </div>
    <dl>
      <dt>Email</dt><dd><a href="mailto:${escapeHtml(o.email || '')}">${escapeHtml(o.email || '—')}</a></dd>
      <dt>Phone</dt><dd>${escapeHtml(o.phone || '—')}</dd>
      <dt>Items</dt><dd>${items}</dd>
    </dl>
  </div>`;
}
