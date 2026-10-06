// Verifies that the caller is a signed-in admin.
//
// Needed because deleting a user is the first endpoint that acts on someone
// else's account. Every other route is read-mostly or scoped to data the
// caller already supplies, so none of them authenticate the caller — the
// client sends a Firebase ID token on some requests, but nothing verifies it.
// An unauthenticated delete endpoint would let anyone who can reach the
// backend remove accounts, so this route verifies rather than trusting a
// role string sent by the client.
const { db } = require('../config/firebaseAdmin');

// Required lazily. firebase-admin/auth pulls in `jose`, which ships ESM only,
// and Jest does not transform node_modules — importing it at module load broke
// six existing suites that never touch this route. Loading it inside the
// handler keeps the test environment clear of it.
const getAuthLazy = () => require('firebase-admin/auth').getAuth();

async function requireAdmin(req, res, next) {
  if (!db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization bearer token' });
  }

  let decoded;
  try {
    decoded = await getAuthLazy().verifyIdToken(token);
  } catch (err) {
    // Covers expired, malformed and revoked tokens alike. The specific reason
    // is logged but not returned, so a caller cannot probe for valid uids.
    console.warn('[AUTH] Token rejected:', err.code || err.message);
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  // The role lives in Firestore, not in the token's claims, so it has to be
  // read here. Trusting a role sent in the request body would defeat the point.
  try {
    const snap = await db.collection('Users').doc(decoded.uid).get();
    if (!snap.exists) {
      return res.status(403).json({ error: 'No user record for this account' });
    }
    if (snap.data().role_id !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.caller = { uid: decoded.uid, email: decoded.email, role: 'admin' };
    next();
  } catch (err) {
    console.error('[AUTH] Role lookup failed:', err.message);
    res.status(500).json({ error: 'Could not verify permissions' });
  }
}

module.exports = requireAdmin;
