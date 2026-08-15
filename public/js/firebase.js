// Genus Coffee — Firebase bootstrap.
// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 (see SETUP.md): paste your Firebase web config below, replacing every
// REPLACE_… placeholder. Until you do, the site runs in DEMO MODE: products come
// from js/data.js, the cart works, but checkout and booking submits are stubbed
// with a friendly notice instead of hitting Firestore/Stripe.
// Firebase SDK version is pinned to 10.12.2 across every import URL below.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCL1mbPrygzE_KPqmAUaRPAPoCwz0HT7mU',
  authDomain: 'shop-genus-coffee.firebaseapp.com',
  projectId: 'shop-genus-coffee',
  storageBucket: 'shop-genus-coffee.firebasestorage.app',
  messagingSenderId: '531684330205',
  appId: '1:531684330205:web:f7a68f4186d36d49bfa934',
  measurementId: 'G-E17NQXLE7Z',
};

// Region your Cloud Functions are deployed to (Firebase default is us-central1).
export const FUNCTIONS_REGION = 'us-central1';

// Emails allowed into /admin. Real enforcement lives in firestore.rules — keep
// these two lists in sync.
export const ADMIN_EMAILS = ['adrian.danisab@gmail.com', 'orange10verde10@gmail.com'];

export const IS_CONFIGURED = !String(firebaseConfig.apiKey).startsWith('REPLACE');

export const app = IS_CONFIGURED ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const functions = app ? getFunctions(app, FUNCTIONS_REGION) : null;

// Re-export the SDK operations pages need, so the version lives in one place.
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  onSnapshot, query, where, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
export {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
export { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

// Google Analytics — loaded lazily, only in supported browsers. NOTE: this
// fires on page load without a consent gate. If you need GDPR cookie consent
// first (as on rolete-oradea.ro), wrap this in your consent check.
if (app && firebaseConfig.measurementId) {
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js')
    .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => { if (ok) getAnalytics(app); }))
    .catch((e) => console.warn('[analytics] not started:', e.message));
}
