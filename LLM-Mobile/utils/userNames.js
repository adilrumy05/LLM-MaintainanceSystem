// Resolves the user_id stored on a record into a human name.
//
// audit_logs does not store a consistent identifier. services/api.js writes
// `user.uid || user.id || user.email || 'anonymous_user'`, so in practice the
// field holds a uid for some rows, an email address for most, and a literal
// test string for others. Matching on uid alone would leave most rows showing
// a raw value, so this indexes Users by BOTH document id and email.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function loadUserNameMap() {
  const map = new Map();
  try {
    const snap = await getDocs(collection(db, 'Users'));
    snap.forEach(d => {
      const data = d.data() || {};
      const name = (data.username || '').trim();
      if (!name) return;
      map.set(d.id, name);
      if (data.email) map.set(String(data.email).toLowerCase(), name);
    });
  } catch (e) {
    // A failed lookup must not blank out the screen — callers fall back to the
    // raw identifier, which is still more useful than nothing.
    console.warn('[userNames] could not load Users:', e.message);
  }
  return map;
}

// Falls back in decreasing order of usefulness: known name, the email's local
// part (still recognisable), then the raw value.
export function displayUser(map, rawId) {
  if (!rawId) return 'Unknown';
  if (rawId === 'anonymous_user' || rawId === 'anonymous') return 'Anonymous';

  const direct = map.get(rawId) || map.get(String(rawId).toLowerCase());
  if (direct) return direct;

  if (String(rawId).includes('@')) return String(rawId).split('@')[0];
  return String(rawId);
}
