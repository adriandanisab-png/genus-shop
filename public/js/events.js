import { renderChrome, eventCardHTML, accordionHTML, wireAccordion, escapeHtml } from './components.js';
import { PACKAGES, FAQ } from './data.js';
import { IS_CONFIGURED, db, collection, addDoc, serverTimestamp } from './firebase.js';

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
    errorEl.textContent = 'Sorry — something went wrong sending your request. Please email us at hello@genuscoffee.ro.';
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
