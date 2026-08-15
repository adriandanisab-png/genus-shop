// Admin › Subscriptions — active/past subscriptions from Stripe via the Worker.
import { escapeHtml } from '../components.js';
import { adminFetch, fmtUnix, fmtMinor, errBox } from './api.js';

export async function render(panel) {
  panel.innerHTML = '<p class="empty-state">Loading subscriptions…</p>';
  let data;
  try { data = await adminFetch('/subscriptions'); }
  catch (e) { panel.innerHTML = errBox('subscriptions', e.message); return; }

  const subs = data.subs || [];
  panel.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn--secondary btn--sm" data-refresh type="button">Refresh</button>
      <span class="link-quiet">${subs.length} subscription${subs.length === 1 ? '' : 's'}</span>
      <a class="link-quiet" href="https://dashboard.stripe.com/test/subscriptions" target="_blank" rel="noopener" style="margin-left:auto">Manage in Stripe →</a>
    </div>
    ${subs.length ? subs.map(rowHTML).join('')
      : '<p class="empty-state">No subscriptions yet. Share <strong>/subscribe.html</strong> with customers.</p>'}`;
  panel.querySelector('[data-refresh]').onclick = () => render(panel);
}

function rowHTML(s) {
  const price = s.amount != null ? `${fmtMinor(s.amount, 'ron')}${s.interval ? '/' + escapeHtml(s.interval) : ''}` : '—';
  return `
  <div class="record">
    <div class="record__head">
      <div class="record__title">${escapeHtml(s.name || s.email || 'Subscriber')} · ${price}</div>
      <div class="record__meta"><span class="status-pill status-${escapeHtml(s.status || 'active')}">${escapeHtml(s.status || 'active')}</span></div>
    </div>
    <dl>
      <dt>Email</dt><dd><a href="mailto:${escapeHtml(s.email || '')}">${escapeHtml(s.email || '—')}</a></dd>
      <dt>Started</dt><dd>${fmtUnix(s.created)}</dd>
      <dt>Renews</dt><dd>${fmtUnix(s.currentPeriodEnd)}</dd>
    </dl>
  </div>`;
}
