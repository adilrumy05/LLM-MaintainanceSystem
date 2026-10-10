// Verifies that the caller is signed in, and says who they are.
//
// requireAdmin.js without the role check. Used where a request spends money or
// reads something kept for one account, so the uid cannot be taken from the
// request body.
const { db } = require('../config/firebaseAdmin');

// Required lazily, for the reason given in requireAdmin.js.
const getAuthLazy = () => require('firebase-admin/auth').getAuth();

async function requireUser(req, res, next) {
  if (!db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization bearer token' });
  }

  try {
    const decoded = await getAuthLazy().verifyIdToken(token);
    req.caller = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    // The specific reason is logged but not returned, as in requireAdmin.js.
    console.warn('[AUTH] Token rejected:', err.code || err.message);
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

module.exports = requireUser;
