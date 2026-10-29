import { renderBoxChrome, TIERS, FREQ_LABEL, getPlans, startBoxCheckout, escapeHtml } from './shared.js';

renderBoxChrome('plan');

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOX_IDS = ['duo', 'trio', 'reserve'];
const BOX_DESC = { duo: '2 × 250g', trio: '3 × 250g', reserve: 'Trio + micro-lot' };

let plans = null;
let loadFailed = false;
let box = BOX_IDS.includes(params.get('box')) ? params.get('box') : 'trio';
let freq = ['0', '1', '2'].includes(params.get('freq')) ? Number(params.get('freq')) : 1;
let busy = false;
let error = '';

function freqOptions() {
  const f = [1, 2];
  if (box !== 'reserve' && plans?.oneOff?.[box]) f.push(0);
  else if (box !== 'reserve' && !plans) f.push(0);
  return f;
}
function normalize() {
  if (!freqOptions().includes(freq)) freq = 1;
  const sub = plans?.subscriptions?.[box];
  if (sub?.intervals && freq !== 0 && !sub.intervals.includes(freq)) freq = sub.intervals[0];
}

function tasteProfile() {
  try { const s = JSON.parse(localStorage.getItem('genusBoxQuiz') || 'null'); return s?.answers && Object.keys(s.answers).length ? s.answers : undefined; } catch { return undefined; }
}

function money() {
  if (!plans) return null;
  if (freq === 0) {
    const p = plans.oneOff?.[box]?.price;
    return p == null ? null : { base: p, today: p, off: 0, recurring: null };
  }
  const p = plans.subscriptions?.[box]?.price;
  if (p == null) return null;
  const f = plans.founding;
  const intro = f?.active && f.plan === box && box === 'trio' && f.firstBoxPrice != null;
  const off = intro ? Math.max(0, p - f.firstBoxPrice) : 0;
  return { base: p, today: p - off, off, recurring: p, intro };
}

function renderBoxes() {
  $('boxes').innerHTML = BOX_IDS.filter((id) => !plans || plans.subscriptions?.[id]).map((id) => `
    <label class="opt-card opt-card--box" style="--c:var(--tier-${id})">
      <input type="radio" name="box" value="${id}"${id === box ? ' checked' : ''}>
      <span class="opt-card__bar"></span>
      <span class="opt-card__title">${TIERS[id].name}</span>
      <span class="opt-card__hint">${BOX_DESC[id]}</span>
    </label>`).join('');
  $('boxes').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { box = i.value; normalize(); error = ''; render(); }));
}

function renderFreqs() {
  $('freqs').innerHTML = freqOptions().map((f) =>
    `<button type="button" class="seg__item" data-f="${f}" aria-pressed="${f === freq}">${FREQ_LABEL[f]}</button>`).join('');
  $('freqs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { freq = Number(b.dataset.f); error = ''; render(); }));
  $('freq-note').textContent = freq === 0
    ? 'Fără abonament. Costă mai mult pe cutie.'
    : 'Abonament: pauză, schimbare sau anulare oricând, dintr-un click.';
}

function renderSummary() {
  const m = money();
  const name = TIERS[box].name;
  let html = `<p class="summary__label">COMANDA TA</p>`;
  if (!m) {
    html += loadFailed ? '' : '<p class="summary__small">Se încarcă prețurile…</p>';
  } else {
    html += `<div class="summary__row"><span>${name} · ${FREQ_LABEL[freq].toLowerCase()}</span><span>${m.base} lei</span></div>`;
    if (m.off > 0) html += `<div class="summary__row summary__discount"><span>Prima cutie Trio</span><span>−${m.off} lei</span></div>`;
    html += `<div class="summary__row"><span>Livrare la easybox</span><span>gratuit</span></div>
      <div class="summary__total"><span style="font-weight:600">Plătești azi</span><strong>${m.today} lei</strong></div>`;
    html += freq === 0
      ? '<p class="summary__small">O singură plată. Nu te înscriem în niciun abonament.</p>'
      : `<p class="summary__small">Apoi ${m.recurring} lei ${freq === 1 ? 'pe lună' : 'la 2 luni'}. Primești email cu 5 zile înainte de fiecare plată.</p>`;
  }
  if (loadFailed) html += '<div class="notice" role="alert">Prețurile nu s-au încărcat, reîncarcă pagina.</div>';
  html += `<div aria-live="polite" id="pay-error">${error ? `<div class="notice">${escapeHtml(error)}</div>` : ''}</div>
    <button type="button" class="btn btn--primary btn--lg btn--block" id="pay"${!m || busy ? ' disabled' : ''}>${busy ? '<span class="pay-spinner" aria-hidden="true"></span>Se deschide plata…' : 'Plătește cu cardul'}</button>
    <ul class="summary__list">
      <li>✓ Plată securizată prin Stripe · TVA inclus</li>
      <li>✓ Vezi cafelele cu 5 zile înainte; schimbi sau sari luna</li>
      <li>✓ Nu ți-a plăcut o cafea? 25 lei reducere la următoarea</li>
    </ul>`;
  $('summary').innerHTML = html;
  $('pay').addEventListener('click', pay);
  $('pay').setAttribute('aria-busy', String(busy));
}

function render() { normalize(); renderBoxes(); renderFreqs(); renderSummary(); }

const rules = {
  name: [(v) => v.length >= 2, 'Scrie numele complet.'],
  locker: [(v) => v.length >= 3, 'Alege un easybox sau FANbox (oraș, adresă).'],
  email: [(v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Scrie o adresă de email validă.'],
  phone: [(v) => v.replace(/[\s.\-()]/g, '').replace(/^\+4/, '').replace(/^0040/, '0').replace(/^40/, '0').match(/^07\d{8}$/) !== null, 'Scrie un număr de telefon valid (07xx xxx xxx).'],
};
const fieldEl = (k) => $('f-' + k);
function validateField(k) {
  const v = fieldEl(k).value.trim();
  const ok = rules[k][0](v);
  $('e-' + k).textContent = ok ? '' : rules[k][1];
  fieldEl(k).setAttribute('aria-invalid', String(!ok));
  return ok;
}
Object.keys(rules).forEach((k) => {
  fieldEl(k).addEventListener('blur', () => { if (fieldEl(k).value || $('e-' + k).textContent) validateField(k); });
  fieldEl(k).addEventListener('input', () => { if ($('e-' + k).textContent) validateField(k); });
});

async function pay() {
  if (busy || !money()) return;
  const results = Object.keys(rules).map(validateField);
  if (results.includes(false)) { const bad = Object.keys(rules).find((k) => fieldEl(k).getAttribute('aria-invalid') === 'true'); fieldEl(bad)?.focus(); return; }
  const customer = {};
  Object.keys(rules).forEach((k) => { customer[k] = fieldEl(k).value.trim(); });
  busy = true; error = ''; renderSummary();
  try {
    if (freq === 0) {
      await startBoxCheckout({ items: [{ id: plans.oneOff[box].id, qty: 1 }], customer });
    } else {
      const f = plans.founding;
      await startBoxCheckout({
        plan: box, interval_count: freq,
        coupon: f?.active && box === 'trio' ? 'founding' : undefined,
        customer, tasteProfile: tasteProfile(),
      });
    }
  } catch {
    busy = false; error = 'Plata nu a pornit, încearcă din nou'; renderSummary();
  }
}

render();
try { plans = await getPlans(); } catch { loadFailed = true; }
render();
