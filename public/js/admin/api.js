// Admin ↔ Worker calls. Attaches the signed-in admin's Firebase ID token; the
// Worker verifies it and checks the email against its admin list.
import { auth } from '../firebase.js';
import { escapeHtml } from '../components.js';

export const WORKER_BASE = 'https://genus-checkout.shop-genus-coffee.workers.dev';

export async function adminFetch(path, { method = 'GET', body } = {}) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in.');
  const token = await u.getIdToken();
  const res = await fetch(WORKER_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function fmtUnix(u) {
  return u ? new Date(u * 1000).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
export function fmtMinor(minor, cur) {
  if (minor == null) return '—';
  const label = !cur || cur === 'ron' ? 'lei' : cur.toUpperCase();
  return new Intl.NumberFormat('ro-RO').format(minor / 100) + ' ' + label;
}

export function errBox(what, msg) {
  return `<div class="notice">Couldn’t load ${escapeHtml(what)}: ${escapeHtml(msg)}.
    <br><span class="link-quiet">If this says “Unauthorized”, redeploy the Worker (admin-auth update) and confirm you’re signed in as an admin.</span></div>`;
}
