const admin = require('firebase-admin');

let db = null;

try {
  const serviceAccount = require('../../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log('[Firebase] Connected to Firestore');
} catch (err) {
  console.warn('[Firebase] serviceAccountKey.json not found — audit logging disabled');
}

module.exports = { db };