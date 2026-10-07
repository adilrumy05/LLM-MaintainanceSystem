// firebase-admin v13+ removed the legacy namespaced API. `admin.credential.cert()`
// and `admin.firestore()` no longer exist — `cert` is a top-level export of
// firebase-admin/app, and Firestore comes from firebase-admin/firestore.
//
// This file still used the old shape, so initialisation threw
// "Cannot read properties of undefined (reading 'cert')" on every start. The
// catch below reported that as "serviceAccountKey.json not found", so the whole
// team saw a missing-key message and audit logging was silently disabled even
// with a perfectly valid key present.
//
// auditLogger.js already imports FieldValue from 'firebase-admin/firestore',
// so this brings the two into line.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db = null;

// The backend moved into backend-node/, so '../../serviceAccountKey.json' now
// resolves to backend-node/ rather than the repository root where the key
// actually lives. Try the repo root first, then alongside the backend, which is
// where a container build would place it.
const KEY_PATHS = [
  path.join(__dirname, '..', '..', '..', 'serviceAccountKey.json'),
  path.join(__dirname, '..', '..', 'serviceAccountKey.json'),
];

function loadServiceAccount() {
  for (const candidate of KEY_PATHS) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  const err = new Error('serviceAccountKey.json not found');
  err.code = 'MODULE_NOT_FOUND';
  throw err;
}

try {
  const serviceAccount = loadServiceAccount();

  // Reuse the app if something already initialised it — initialising twice
  // throws, and this module is required from several places.
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(serviceAccount) });

  db = getFirestore(app);
  console.log('[Firebase] Connected to Firestore');
} catch (err) {
  // Report what actually went wrong. A single catch-all message is what hid the
  // API breakage above for as long as it did.
  if (err.code === 'MODULE_NOT_FOUND') {
    console.warn(
      '[Firebase] serviceAccountKey.json not found at the repository root — audit logging disabled'
    );
  } else {
    console.warn(`[Firebase] initialisation failed — audit logging disabled: ${err.message}`);
  }
}

module.exports = { db };
