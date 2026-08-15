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
  apiKey: 'REPLACE_WITH_API_KEY',
  authDomain: 'REPLACE_WITH_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_PROJECT',
  storageBucket: 'REPLACE_WITH_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
};

// Region your Cloud Functions are deployed to (Firebase default is us-central1).
export const FUNCTIONS_REGION = 'us-central1';

// Emails allowed into /admin. Real enforcement lives in firestore.rules — keep
// these two lists in sync.
export const ADMIN_EMAILS = ['REPLACE_WITH_ADMIN_EMAIL@example.com'];

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
