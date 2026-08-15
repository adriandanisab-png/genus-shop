// Admin ↔ Worker calls. Attaches the signed-in admin's Firebase ID token; the
// Worker verifies it and checks the email against its admin list.
import { auth } from '../firebase.js';

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
