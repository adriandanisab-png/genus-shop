import { db, collection, doc, getDoc, addDoc, serverTimestamp } from '/js/firebase.js';
import { accordionHTML, wireAccordion } from '/js/components.js';
import {
  renderBoxChrome, TIERS, getPlans, BOX_CONFIG, isFoundingOfferOn, monthKey, fmtDate, monthName, escapeHtml, formatMoney,
} from '/js/box/shared.js';

renderBoxChrome('home');

const CARDS = [
  { id: 'duo', badge: '2 × 250g', desc: '1 prăjitorie invitată + Genus. Lunar sau la 2 luni.', href: '/box/plan.html?box=duo' },
  { id: 'trio', badge: 'Cea mai aleasă', desc: '2 prăjitorii invitate + Genus.', href: '/box/plan.html?box=trio' },
  { id: 'reserve', badge: 'Micro-lot', desc: 'Trio cu o cafea rară, greu de găsit.', href: '/box/plan.html?box=reserve' },
  { id: 'gift', badge: 'Fără abonament', desc: 'Trio în cutie de cadou, cu bilet scris de mână.', href: '/box/gift.html' },
];

const money = (n) => (typeof formatMoney === 'function' ? formatMoney(n) : `${n} lei`);

function priceFor(plans, id) {
  if (!plans) return null;
  const v = id === 'gift' ? plans.gift && plans.gift[1] && plans.gift[1].price : plans.subscriptions && plans.subscriptions[id] && plans.subscriptions[id].price;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function renderCards(plans) {
  const grid = document.getElementById('box-grid');
  grid.innerHTML = CARDS.map((c) => {
    const t = TIERS[c.id];
    const p = priceFor(plans, c.id);
    return `<article class="box-card box-card--${c.id}">
      <div class="box-card__media"><img src="${t.seal}" alt="${escapeHtml(t.alt)}" width="110" height="110"></div>
      <div class="box-card__body">
        <span class="box-card__badge">${escapeHtml(c.badge)}</span>
        <h3 class="box-card__name">${escapeHtml(t.name.replace('Gift Trio', 'Cadou'))}</h3>
        <p class="box-card__desc">${escapeHtml(c.desc)}</p>
        ${p ? `<div class="box-card__price">${c.id === 'gift' ? 'de la ' : 'de la '}${escapeHtml(String(p))} lei${c.id === 'gift' ? '' : '/lună'}</div>` : ''}
        <a class="btn btn--secondary btn--sm" href="${c.href}" aria-label="Alege cutia ${escapeHtml(t.name)}">ALEGE +</a>
      </div>
    </article>`;
  }).join('');
}

async function loadPlans() {
  renderCards(null);
  try {
    renderCards(await getPlans());
  } catch (e) {
    const n = document.getElementById('plans-notice');
    n.textContent = 'Prețurile nu s-au încărcat acum. Le vezi când alegi cutia.';
    n.hidden = false;
  }
}

async function loadMonth() {
  const section = document.getElementById('month-section');
  const body = document.getElementById('month-body');
  const key = monthKey();
  try {
    const snap = await getDoc(doc(db, 'boxes', key));
    const b = snap.exists() ? snap.data() : null;
    if (b && b.published) {
      body.innerHTML = `<div class="month-grid">
        <img src="/assets/box/packaging-studio-angle.jpg" alt="Punga de cafea Genus" loading="lazy">
        <div class="stack">
          <span class="sticker sticker--gold">Cutia lunii</span>
          <h2>${escapeHtml(b.theme || monthName(key))}</h2>
          ${b.intro ? `<p>${escapeHtml(b.intro)}</p>` : ''}
          <a class="btn btn--primary" href="/box/this-month.html">VEZI CAFELELE →</a>
        </div></div>`;
      section.hidden = false;
    } else if (b && b.announceDate && fmtDate(b.announceDate)) {
      const luna = new Date(`${key}-01`).toLocaleDateString('ro-RO', { month: 'long' });
      body.innerHTML = `<div class="month-grid">
        <img src="/assets/box/packaging-studio-angle.jpg" alt="Punga de cafea Genus" loading="lazy">
        <div class="stack"><span class="sticker sticker--gold">Cutia lunii</span>
        <h2>Cutia de ${escapeHtml(luna)} se anunță pe ${escapeHtml(fmtDate(b.announceDate))}</h2></div></div>`;
      section.hidden = false;
    }
  } catch (e) {
    section.hidden = true;
  }
}

function wireWaitlist() {
  const form = document.getElementById('waitlist-form');
  const msg = document.getElementById('waitlist-msg');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = document.getElementById('wl-email').value.trim().toLowerCase();
    msg.className = 'waitlist-msg';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Verifică adresa de email.';
      msg.classList.add('notice');
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await addDoc(collection(db, 'waitlist'), { email, source: 'box-home', createdAt: serverTimestamp() });
      msg.textContent = 'Mulțumim! Te anunțăm când se deschide cutia.';
      form.reset();
    } catch (e) {
      msg.textContent = 'Nu am putut salva emailul. Încearcă din nou.';
      msg.classList.add('notice');
    } finally {
      btn.disabled = false;
    }
  });
}

function renderFaq() {
  const el = document.getElementById('faq');
  el.innerHTML = accordionHTML([
    { q: 'Pot sări sau schimba o lună?', a: `Da. Cu ${BOX_CONFIG.swapDeadlineDays} zile înainte de facturare vezi cafelele și poți schimba o cafea sau sări luna, din contul tău.` },
    { q: 'Cât costă livrarea?', a: 'Livrarea la easybox este gratuită.' },
    { q: 'Cât de proaspătă e cafeaua?', a: 'Data prăjirii e pe fiecare pungă, iar cafeaua e prăjită cu cel mult 7 zile înainte de livrare.' },
    { q: 'Ce fac dacă nu mi-a plăcut o cafea?', a: `Notezi cafeaua cu 1 sau 2 stele și primești ${BOX_CONFIG.reviewCredit} lei reducere la următoarea cutie, o dată pe cutie.` },
    { q: 'Pot anula oricând?', a: 'Da, din contul tău, fără penalizări.' },
  ], -1);
  wireAccordion(el);
}

if (isFoundingOfferOn()) document.getElementById('founding-note').hidden = false;
renderFaq();
wireWaitlist();
loadPlans();
loadMonth();
