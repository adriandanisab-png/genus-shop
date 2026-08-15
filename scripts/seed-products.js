#!/usr/bin/env node
/**
 * Seed the Firestore `products` collection from public/js/data.js (single source
 * of truth). Optional — checkout has a server-side price fallback — but seeding
 * lets you manage the catalog from Firestore/admin later.
 *
 * Usage:
 *   cd scripts && npm install
 *   # authenticate (either one):
 *   #   gcloud auth application-default login
 *   #   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   node seed-products.js <your-project-id>
 */
const admin = require('firebase-admin');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const projectId = process.argv[2] || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error('Missing project id. Usage: node seed-products.js <project-id>');
    process.exit(1);
  }

  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const dataPath = path.join(__dirname, '..', 'public', 'js', 'data.js');
  const { PRODUCTS } = await import(pathToFileURL(dataPath).href);

  const batch = db.batch();
  for (const product of PRODUCTS) {
    const { id, ...rest } = product;
    batch.set(db.collection('products').doc(id), rest, { merge: true });
  }
  await batch.commit();

  console.log(`Seeded ${PRODUCTS.length} products into project "${projectId}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
