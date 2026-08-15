import { renderChrome, eventCardHTML, accordionHTML, wireAccordion, escapeHtml } from './components.js';
import { PACKAGES, FAQ, PAST_EVENTS } from './data.js';
import { IS_CONFIGURED, db, collection, addDoc, getDocs, serverTimestamp } from './firebase.js';

renderChrome('events');

const packagesEl = document.getElementById('packages');
const selectEl = document.getElementById('package-select');
const form = document.getElementById('booking-form');
const doneEl = document.getElementById('booking-done');
const errorEl = document.getElementById('booking-error');
const submitBtn = document.getElementById('booking-submit');

let selected = PACKAGES[0].key;

function packageTitle(key) {
  return (PACKAGES.find((p) => p.key === key) || PACKAGES[0]).title;
}

function renderCards() {
  packagesEl.innerHTML = PACKAGES.map((p) => eventCardHTML(p, p.key === selected)).join('');
}

function selectPackage(key) {
  selected = key;
  selectEl.value = key;
  renderCards();
}

// Package tier cards (click + keyboard)
packagesEl.addEventListener('click', (e) => {
  const card = e.target.closest('[data-pkg]');
  if (card) selectPackage(card.dataset.pkg);
});
packagesEl.addEventListener('keydown', (e) => {
  const card = e.target.closest('[data-pkg]');
  if (card && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    selectPackage(card.dataset.pkg);
  }
});

// Package <select>
selectEl.innerHTML = PACKAGES.map((p) => `<option value="${p.key}">${escapeHtml(p.title)}</option>`).join('');
selectEl.value = selected;
selectEl.addEventListener('change', () => selectPackage(selectEl.value));

renderCards();

// FAQ
const faqAcc = document.getElementById('faq-acc');
faqAcc.innerHTML = accordionHTML(FAQ);
wireAccordion(faqAcc);

// Submit → Firestore `bookings`
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const fd = new FormData(form);
  const booking = {
    name: (fd.get('name') || '').trim(),
    email: (fd.get('email') || '').trim(),
    phone: (fd.get('phone') || '').trim(),
    date: fd.get('date') || '',
    package: selected,
    packageLabel: packageTitle(selected),
    guests: fd.get('guests') ? Number(fd.get('guests')) : null,
    message: (fd.get('message') || '').trim(),
    status: 'new',
    source: 'website',
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    if (db) {
      await addDoc(collection(db, 'bookings'), { ...booking, createdAt: serverTimestamp() });
    }
    showThankYou();
  } catch (err) {
    console.error('[events] booking submit failed:', err);
    errorEl.innerHTML = 'Sorry — something went wrong. <a href="https://wa.me/40723910971" target="_blank" rel="noopener">Message us on WhatsApp</a> and we’ll sort it.';
    errorEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request a quote';
  }
});

function showThankYou() {
  const demoNote = IS_CONFIGURED
    ? ''
    : '<p style="margin-top:12px; font-size:13px; color:var(--text-tertiary)">Demo mode: connect Firebase (see SETUP.md) to actually receive this request.</p>';
  doneEl.innerHTML = `
    <div class="panel">
      <h3 style="font-family:var(--font-display); font-size:22px; margin-bottom:10px">Request received</h3>
      <p style="color:var(--text-secondary); line-height:var(--leading-relaxed)">
        Thanks — we'll reply within one business day with a quote for your ${escapeHtml(packageTitle(selected).toLowerCase())} package.
      </p>
      ${demoNote}
    </div>`;
  form.hidden = true;
  doneEl.hidden = false;
  doneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---- Past events gallery (Firestore `pastEvents`, fallback to seed) ---- */
function peCardHTML(e) {
  const meta = [e.date, e.location].filter(Boolean).map(escapeHtml).join(' · ');
  return `<figure class="pe-card">
    <div class="pe-card__media">${e.image ? `<img src="${escapeHtml(e.image)}" alt="${escapeHtml(e.title || '')}" loading="lazy">` : ''}</div>
    <figcaption class="pe-card__body">
      ${meta ? `<div class="pe-card__meta">${meta}</div>` : ''}
      <h3 class="pe-card__title">${escapeHtml(e.title || '')}</h3>
      ${e.blurb ? `<p class="pe-card__blurb">${escapeHtml(e.blurb)}</p>` : ''}
    </figcaption>
  </figure>`;
}

async function loadPastEvents() {
  const el = document.getElementById('past-events');
  if (!el) return;
  let list = PAST_EVENTS;
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'pastEvents'));
      if (!snap.empty) list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    } catch (err) { /* keep seed */ }
  }
  el.innerHTML = list.map(peCardHTML).join('');
}
loadPastEvents();
