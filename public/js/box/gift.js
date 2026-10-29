import { renderBoxChrome, TIERS, BOX_CONFIG, getPlans, startBoxCheckout, escapeHtml } from './shared.js';

renderBoxChrome('gift');

const $ = (id) => document.getElementById(id);
const DURATIONS = [[1, '1 cutie'], [3, '3 luni'], [6, '6 luni']];
let plans = null, loadFailed = false, months = 1, busy = false, error = '';

// Banner by date: visible between giftBannerFrom and giftOrderBy; after that, "după sărbători" until 31 Dec.
function renderBanner() {
  const now = new Date();
  const b = $('gift-banner');
  const from = new Date(BOX_CONFIG.giftBannerFrom), by = new Date(BOX_CONFIG.giftOrderBy);
  const endOfYear = new Date(by.getFullYear(), 11, 31, 23, 59, 59);
  if (now >= from && now <= by) {
    b.textContent = 'Comandă până pe 15 decembrie și ajunge înainte de Crăciun.';
    b.hidden = false;
  } else if (now > by && now <= endOfYear) {
    b.textContent = 'Comenzile de acum pleacă după sărbători: livrare după sărbători.';
    b.hidden = false;
  } else b.hidden = true;
}
renderBanner();
$('gift-seal').alt = TIERS.gift.alt;

// Keep emoji and printable text; drop control chars, zero-width/format and private-use symbols.
function cleanNote(s) {
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF\uFFF0-\uFFFF]/g, '');
}
const clip = (s, n) => [...s].slice(0, n).join('');

function renderDurations() {
  $('durations').innerHTML = DURATIONS.filter(([m]) => !plans || plans.gift?.[m]).map(([m, label]) => {
    const p = plans?.gift?.[m]?.price;
    return `<button type="button" class="seg__item" data-m="${m}" aria-pressed="${m === months}"><span>${label}</span><span>${p != null ? p + ' lei' : '…'}</span></button>`;
  }).join('');
  $('durations').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { months = Number(b.dataset.m); error = ''; render(); }));
  $('dur-note').textContent = months === 1 ? 'O singură cutie Trio, livrată o dată.' : `O cutie Trio pe lună, ${months} luni, plătit o dată. Se oprește singur la final.`;
}

function renderPay() {
  const p = plans?.gift?.[months]?.price;
  $('total').textContent = p != null ? `${p} lei` : '— lei';
  const ok = p != null && !busy;
  const btn = $('pay');
  btn.disabled = !ok;
  btn.setAttribute('aria-busy', String(busy));
  btn.innerHTML = busy ? '<span class="pay-spinner" aria-hidden="true"></span>Se deschide plata…' : 'Trimite cadoul';
  const msg = loadFailed ? 'Prețurile nu s-au încărcat, reîncarcă pagina.' : error;
  $('pay-error').innerHTML = msg ? `<div class="notice" ${loadFailed ? 'role="alert"' : ''}>${escapeHtml(msg)}</div>` : '';
}

function render() { renderDurations(); renderPay(); }

function updateTag() {
  const n = $('g-rname').value.trim();
  $('tag-name').textContent = n || '[Nume]';
  const note = $('g-note').value.trim();
  $('tag-note').textContent = note ? clip(note, 60) : 'Crăciun fericit!';
}
$('g-rname').addEventListener('input', updateTag);
$('g-note').addEventListener('input', () => {
  const t = $('g-note');
  const c = clip(cleanNote(t.value), 200);
  if (c !== t.value) t.value = c;
  $('note-count').textContent = `${[...c].length} / 200`;
  updateTag();
});

const rules = {
  bname: [(v) => v.length >= 2, 'Scrie numele tău.'],
  bemail: [(v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Scrie o adresă de email validă.'],
  bphone: [(v) => /^07\d{8}$/.test(v.replace(/[\s.\-()]/g, '').replace(/^\+4/, '').replace(/^0040/, '0').replace(/^40/, '0')), 'Scrie un număr de telefon valid (07xx xxx xxx).'],
  rname: [(v) => v.length >= 2, 'Scrie numele destinatarului.'],
  raddr: [(v) => v.length >= 5, 'Scrie adresa sau easybox-ul destinatarului.'],
};
const el = (k) => $('g-' + k);
function validate(k) {
  const ok = rules[k][0](el(k).value.trim());
  $('e-' + k).textContent = ok ? '' : rules[k][1];
  el(k).setAttribute('aria-invalid', String(!ok));
  return ok;
}
Object.keys(rules).forEach((k) => {
  el(k).addEventListener('blur', () => { if (el(k).value || $('e-' + k).textContent) validate(k); });
  el(k).addEventListener('input', () => { if ($('e-' + k).textContent) validate(k); });
});

$('gift-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || !plans?.gift?.[months]) return;
  const res = Object.keys(rules).map(validate);
  if (res.includes(false)) { el(Object.keys(rules).find((k) => el(k).getAttribute('aria-invalid') === 'true')).focus(); return; }
  busy = true; error = ''; renderPay();
  try {
    await startBoxCheckout({
      items: [{ id: plans.gift[months].id, qty: 1 }],
      customer: { name: el('bname').value.trim(), email: el('bemail').value.trim(), phone: el('bphone').value.trim() },
      gift: { recipient: el('rname').value.trim(), address: el('raddr').value.trim(), note: clip(cleanNote(el('note').value).trim(), 200), months },
    });
  } catch {
    busy = false; error = 'Plata nu a pornit, încearcă din nou'; renderPay();
  }
});

render();
try { plans = await getPlans(); } catch { loadFailed = true; }
render();
