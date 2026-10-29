// Genus Coffee — admin core: Google-auth gate + tabs. Each tab is a module in
// js/admin/ exporting `render(panel, ctx)`.
import { renderChrome, escapeHtml } from './components.js';
import {
  IS_CONFIGURED, ADMIN_EMAILS, auth,
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
} from './firebase.js';
import * as products from './admin/products.js';
import * as orders from './admin/orders.js';
import * as bookings from './admin/bookings.js';
import * as discounts from './admin/discounts.js';
import * as subscriptions from './admin/subscriptions.js';
import * as pastevents from './admin/past-events.js';
import * as box from './admin/box.js';

const MODULES = { products, orders, bookings, discounts, subscriptions, box, pastevents };

renderChrome();

const gate = document.getElementById('admin-gate');
const appEl = document.getElementById('admin-app');
const panel = document.getElementById('admin-panel');
const emailEl = document.getElementById('admin-email');

let user = null;
let activeTab = 'products';

if (!IS_CONFIGURED) {
  gate.innerHTML = `<div class="notice signin-card">Admin needs Firebase configured first. See <strong>SETUP.md</strong>, then reload.</div>`;
} else {
  onAuthStateChanged(auth, (u) => {
    if (!u) return showSignIn();
    if (!ADMIN_EMAILS.includes(u.email)) return showDenied(u);
    user = u;
    showApp();
  });
}

function showSignIn() {
  user = null;
  appEl.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <div class="panel signin-card">
      <h1>Genus admin</h1>
      <p>Sign in with an approved Google account.</p>
      <button class="btn btn--primary" id="signin" type="button">Sign in with Google</button>
    </div>`;
  document.getElementById('signin').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { console.error('[admin] sign-in failed', e); }
  });
}

function showDenied(u) {
  appEl.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <div class="panel signin-card">
      <h1>No access</h1>
      <p><strong>${escapeHtml(u.email)}</strong> isn’t on the admin list.<br>Add it to <code>ADMIN_EMAILS</code> and <code>firestore.rules</code>.</p>
      <button class="btn btn--secondary" id="signout2" type="button">Sign out</button>
    </div>`;
  document.getElementById('signout2').addEventListener('click', () => signOut(auth));
}

function showApp() {
  gate.hidden = true;
  gate.innerHTML = '';
  appEl.hidden = false;
  emailEl.textContent = user.email;
  renderActive();
}

document.getElementById('signout').addEventListener('click', () => signOut(auth));

document.querySelector('.admin-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  activeTab = b.dataset.tab;
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('is-active', t === b));
  renderActive();
});

function renderActive() {
  const mod = MODULES[activeTab];
  panel.innerHTML = '<p class="empty-state">Loading…</p>';
  Promise.resolve(mod.render(panel, { user })).catch((err) => {
    console.error(`[admin:${activeTab}]`, err);
    panel.innerHTML = `<div class="notice">Couldn’t load this tab: ${escapeHtml(err.message || String(err))}</div>`;
  });
}
