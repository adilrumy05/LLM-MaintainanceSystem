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

// On a host such as Railway there is no key file: the file is gitignored, so it
// never reaches the build. The key can instead be given as an environment
// variable holding the JSON, either as it is or base64-encoded. The variable
// wins over a file, so a deployment never silently picks up a stale local key.
function parseServiceAccount(raw) {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const account = JSON.parse(text);
  // Pasting the JSON into a single-line variable often leaves the private key's
  // line breaks as the two characters "\n", which the PEM parser rejects.
  if (typeof account.private_key === 'string') {
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key');
  }
  return account;
}

function loadServiceAccount(env = process.env) {
  if (env.FIREBASE_SERVICE_ACCOUNT && env.FIREBASE_SERVICE_ACCOUNT.trim()) {
    return parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  }
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
      '[Firebase] No admin key: set FIREBASE_SERVICE_ACCOUNT or put serviceAccountKey.json at the repository root — audit logging disabled'
    );
  } else {
    console.warn(`[Firebase] initialisation failed — audit logging disabled: ${err.message}`);
  }
}

module.exports = { db, loadServiceAccount, parseServiceAccount };
