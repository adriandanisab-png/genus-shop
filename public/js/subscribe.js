import { renderChrome, escapeHtml } from './components.js';
import { icon } from './icons.js';
import { SUBSCRIPTION_PLANS, formatMoney } from './data.js';

// Same Worker as checkout; /subscribe route (public).
const SUBSCRIBE_ENDPOINT = 'https://genus-checkout.shop-genus-coffee.workers.dev/subscribe';

renderChrome('subscribe');

const root = document.getElementById('plans');
const note = document.getElementById('subscribe-note');

function planHTML(p) {
  return `
  <div class="event-card">
    <span class="event-card__icon">${icon('coffee', 26)}</span>
    <h3 class="event-card__title">${escapeHtml(p.title)}</h3>
    <div class="mono" style="font-size:22px">${formatMoney(p.price)}<span style="font-size:14px;color:var(--text-secondary)"> /${escapeHtml(p.interval)}</span></div>
    <p class="event-card__desc">${escapeHtml(p.description)}</p>
    ${p.details && p.details.length ? `<ul class="event-card__list">${p.details.map((d) => `<li>${icon('check', 14)}${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
    <button class="btn btn--primary" data-plan="${escapeHtml(p.id)}" type="button" style="margin-top:8px">Subscribe</button>
  </div>`;
}

root.innerHTML = SUBSCRIPTION_PLANS.map(planHTML).join('');

root.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-plan]');
  if (!btn) return;
  note.hidden = true;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  try {
    const res = await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: btn.dataset.plan,
        successUrl: `${location.origin}/success.html`,
        cancelUrl: `${location.origin}/subscribe.html`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      location.assign(data.url);
    } else {
      throw new Error(data.error || 'Could not start the subscription.');
    }
  } catch (err) {
    note.textContent = err.message;
    note.hidden = false;
    btn.disabled = false;
    btn.textContent = original;
  }
});
