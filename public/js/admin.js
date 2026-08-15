import { renderChrome, escapeHtml } from './components.js';
import {
  IS_CONFIGURED, ADMIN_EMAILS, auth, db,
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  collection, query, orderBy, onSnapshot, doc, updateDoc,
} from './firebase.js';

renderChrome();

const gate = document.getElementById('admin-gate');
const appEl = document.getElementById('admin-app');
const panel = document.getElementById('admin-panel');
const emailEl = document.getElementById('admin-email');

const BOOKING_STATUSES = ['new', 'contacted', 'booked', 'declined'];

let bookings = [];
let tab = 'bookings';
let subscribed = false;

/* ------------------------------------------------------------ gate */
if (!IS_CONFIGURED) {
  gate.innerHTML = `<div class="notice signin-card">Admin needs Firebase configured first. See <strong>SETUP.md</strong>, then reload.</div>`;
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) return showSignIn();
    if (!ADMIN_EMAILS.includes(user.email)) return showDenied(user);
    showApp(user);
  });
}

function showSignIn() {
  appEl.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <div class="panel signin-card">
      <h1>Genus admin</h1>
      <p>Sign in with an approved Google account to view orders and event bookings.</p>
      <button class="btn btn--primary" id="signin" type="button">Sign in with Google</button>
    </div>`;
  document.getElementById('signin').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { console.error('[admin] sign-in failed', e); }
  });
}

function showDenied(user) {
  appEl.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <div class="panel signin-card">
      <h1>No access</h1>
      <p><strong>${escapeHtml(user.email)}</strong> isn’t on the admin list.<br>Add it to <code>ADMIN_EMAILS</code> and <code>firestore.rules</code>.</p>
      <button class="btn btn--secondary" id="signout2" type="button">Sign out</button>
    </div>`;
  document.getElementById('signout2').addEventListener('click', () => signOut(auth));
}

function showApp(user) {
  gate.hidden = true;
  gate.innerHTML = '';
  appEl.hidden = false;
  emailEl.textContent = user.email;
  if (!subscribed) { subscribe(); subscribed = true; }
  renderPanel();
}

document.getElementById('signout').addEventListener('click', () => signOut(auth));

document.querySelector('.admin-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('is-active', t === b));
  renderPanel();
});

/* ------------------------------------------------------------ data */
function subscribe() {
  onSnapshot(query(collection(db, 'bookings'), orderBy('createdAt', 'desc')), (snap) => {
    bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (tab === 'bookings') renderPanel();
  }, (err) => console.error('[admin] bookings listen failed', err));
}

// Booking status change (delegated)
panel.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-booking-status]');
  if (!sel) return;
  const id = sel.dataset.bookingStatus;
  try { await updateDoc(doc(db, 'bookings', id), { status: sel.value }); }
  catch (err) { console.error('[admin] status update failed', err); }
});

/* ------------------------------------------------------------ render */
function fmtDate(ts) {
  if (ts && typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return '—';
}
function statusPill(status) {
  const s = escapeHtml(status || 'new');
  return `<span class="status-pill status-${s}">${s}</span>`;
}

function renderPanel() {
  if (tab === 'bookings') {
    panel.innerHTML = bookings.length
      ? bookings.map(bookingHTML).join('')
      : `<p class="empty-state">No event bookings yet.</p>`;
  } else {
    panel.innerHTML = `<div class="panel">
      <h3 style="font-family:var(--font-display); font-size:20px; margin-bottom:10px">Orders live in Stripe</h3>
      <p style="color:var(--text-secondary); line-height:var(--leading-relaxed); margin-bottom:18px">
        Shop payments run through Stripe Payment Links, so every order — customer, items, shipping and payment status — is in your Stripe Dashboard.
      </p>
      <a class="btn btn--primary" href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener">Open Stripe payments →</a>
    </div>`;
  }
}

function bookingHTML(b) {
  const options = BOOKING_STATUSES
    .map((s) => `<option value="${s}"${(b.status || 'new') === s ? ' selected' : ''}>${s}</option>`)
    .join('');
  return `
  <div class="record">
    <div class="record__head">
      <div class="record__title">${escapeHtml(b.name || 'Unnamed')} · ${escapeHtml(b.packageLabel || b.package || '')}</div>
      <div class="record__meta">${escapeHtml(b.date || '')} &nbsp;·&nbsp; sent ${fmtDate(b.createdAt)}</div>
    </div>
    <dl>
      <dt>Email</dt><dd><a href="mailto:${escapeHtml(b.email || '')}">${escapeHtml(b.email || '—')}</a></dd>
      <dt>Phone</dt><dd>${escapeHtml(b.phone || '—')}</dd>
      <dt>Guests</dt><dd>${b.guests != null ? escapeHtml(String(b.guests)) : '—'}</dd>
      <dt>Notes</dt><dd>${escapeHtml(b.message || '—')}</dd>
    </dl>
    <div class="record__actions">
      ${statusPill(b.status)}
      <div class="select-wrap">
        <select class="select" data-booking-status="${escapeHtml(b.id)}">${options}</select>
      </div>
    </div>
  </div>`;
}

