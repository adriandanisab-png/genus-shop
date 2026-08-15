// Admin › Discounts — create & list Stripe promotion codes, via the Worker.
import { escapeHtml } from '../components.js';
import { adminFetch } from './api.js';
import { errBox } from './orders.js';

let _panel = null;

export async function render(panel) {
  _panel = panel;
  await draw();
}

async function draw() {
  _panel.innerHTML = '<p class="empty-state">Loading…</p>';
  let data;
  try { data = await adminFetch('/coupons'); }
  catch (e) { _panel.innerHTML = errBox('discount codes', e.message); return; }

  const codes = data.codes || [];
  _panel.innerHTML = `
    ${formHTML()}
    <div class="admin-toolbar" style="margin-top:28px">
      <button class="btn btn--secondary btn--sm" data-refresh type="button">Refresh</button>
      <span class="link-quiet">${codes.length} code${codes.length === 1 ? '' : 's'}</span>
    </div>
    ${codes.length ? codes.map(rowHTML).join('') : '<p class="empty-state">No discount codes yet.</p>'}`;
  wire();
}

function formHTML() {
  return `
  <form class="panel" data-create style="margin-bottom:4px">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:16px">New discount code</h3>
    <div class="form-grid">
      <label class="field"><span class="field__label">Code</span>
        <input class="input" name="code" placeholder="WELCOME10" required></label>
      <label class="field"><span class="field__label">Percent off (%)</span>
        <input class="input" name="percentOff" type="number" min="1" max="100" placeholder="10"></label>
      <label class="field"><span class="field__label">…or amount off (lei)</span>
        <input class="input" name="amountOff" type="number" min="1" placeholder="20"></label>
      <label class="field"><span class="field__label">Applies</span>
        <div class="select-wrap"><select class="select" name="duration">
          <option value="once">Once per customer</option>
          <option value="forever">Forever</option>
        </select></div></label>
      <label class="field"><span class="field__label">Max total uses (optional)</span>
        <input class="input" name="maxRedemptions" type="number" min="1" placeholder="100"></label>
    </div>
    <div class="notice" data-err hidden style="margin-top:14px"></div>
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn--primary" type="submit">Create code</button>
      <span class="link-quiet" data-ok hidden>Created ✓</span>
    </div>
  </form>`;
}

function rowHTML(c) {
  const value = c.percentOff != null ? `${c.percentOff}% off`
    : c.amountOff != null ? `${new Intl.NumberFormat('ro-RO').format(c.amountOff / 100)} ${(c.currency || 'ron') === 'ron' ? 'lei' : (c.currency || '').toUpperCase()} off`
    : '—';
  const uses = c.maxRedemptions ? `${c.timesRedeemed}/${c.maxRedemptions}` : `${c.timesRedeemed}`;
  return `
  <div class="record">
    <div class="record__head">
      <div class="record__title mono">${escapeHtml(c.code)} · ${escapeHtml(value)}</div>
      <div class="record__meta"><span class="status-pill status-${c.active ? 'active' : 'canceled'}">${c.active ? 'active' : 'inactive'}</span></div>
    </div>
    <dl>
      <dt>Applies</dt><dd>${escapeHtml(c.duration || '—')}</dd>
      <dt>Used</dt><dd>${escapeHtml(uses)} time(s)</dd>
    </dl>
  </div>`;
}

function wire() {
  const refresh = _panel.querySelector('[data-refresh]');
  if (refresh) refresh.onclick = () => draw();
  const form = _panel.querySelector('form[data-create]');
  if (form) form.onsubmit = onCreate;
}

async function onCreate(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('[data-err]');
  const ok = form.querySelector('[data-ok]');
  err.hidden = true; ok.hidden = true;
  const fd = new FormData(form);
  const body = {
    code: String(fd.get('code') || '').trim(),
    percentOff: fd.get('percentOff') ? Number(fd.get('percentOff')) : undefined,
    amountOff: !fd.get('percentOff') && fd.get('amountOff') ? Number(fd.get('amountOff')) : undefined,
    duration: fd.get('duration') || 'once',
    maxRedemptions: fd.get('maxRedemptions') ? Number(fd.get('maxRedemptions')) : undefined,
  };
  if (!body.percentOff && !body.amountOff) { err.textContent = 'Set a percent or an amount off.'; err.hidden = false; return; }

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; submit.textContent = 'Creating…';
  try {
    await adminFetch('/coupons', { method: 'POST', body });
    await draw();
  } catch (e2) {
    err.textContent = e2.message || 'Could not create the code.';
    err.hidden = false;
    submit.disabled = false; submit.textContent = 'Create code';
  }
}
