// Admin › Orders — recent paid orders, pulled from Stripe via the Worker.
import { escapeHtml } from '../components.js';
import { adminFetch, fmtUnix, fmtMinor } from './api.js';

export async function render(panel) {
  panel.innerHTML = '<p class="empty-state">Loading orders…</p>';
  let data;
  try { data = await adminFetch('/orders'); }
  catch (e) { panel.innerHTML = errBox('orders', e.message); return; }

  const orders = data.orders || [];
  panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--secondary btn--sm" data-refresh type="button">Refresh</button>
      <span class="link-quiet">${orders.length} recent order${orders.length === 1 ? '' : 's'}</span>
      <a class="link-quiet" href="https://dashboard.stripe.com/test/payments" target="_blank" rel="noopener" style="margin-left:auto">Full history in Stripe →</a>
    </div>
    ${orders.length ? orders.map(rowHTML).join('') : '<p class="empty-state">No paid orders yet.</p>'}`;
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
      <div class="record__meta">${fmtUnix(o.created)} &nbsp;·&nbsp; <span class="status-pill status-paid">${escapeHtml(o.status || 'paid')}</span></div>
    </div>
    <dl>
      <dt>Email</dt><dd><a href="mailto:${escapeHtml(o.email || '')}">${escapeHtml(o.email || '—')}</a></dd>
      <dt>Items</dt><dd>${items}</dd>
    </dl>
  </div>`;
}

export function errBox(what, msg) {
  return `<div class="notice">Couldn’t load ${what}: ${escapeHtml(msg)}.
    <br><span class="link-quiet">If this says “Unauthorized”, redeploy the Worker (it needs the admin-auth update) and make sure you’re signed in as an admin.</span></div>`;
}
