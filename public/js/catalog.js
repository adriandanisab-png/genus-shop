// Genus Coffee — catalog access. Reads products from Firestore when configured
// and non-empty; otherwise falls back to the local PRODUCTS in data.js so the
// shop always renders.
import { db, collection, getDocs, doc, getDoc } from './firebase.js';
import { PRODUCTS } from './data.js';

let _cache = null;

export async function getProducts() {
  if (_cache) return _cache;
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'products'));
      if (!snap.empty) {
        _cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return _cache;
      }
    } catch (e) {
      console.warn('[catalog] Firestore read failed, using local data:', e.message);
    }
  }
  _cache = PRODUCTS;
  return _cache;
}

export async function getProduct(id) {
  if (db) {
    try {
      const s = await getDoc(doc(db, 'products', id));
      if (s.exists()) return { id: s.id, ...s.data() };
    } catch (e) {
      console.warn('[catalog] Firestore product read failed, using local data:', e.message);
    }
  }
  return PRODUCTS.find((p) => p.id === id) || null;
}
