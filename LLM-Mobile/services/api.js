import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ── Resolve the correct API base URL ────────────────────────────────────────
// On web (localhost:8081) the LAN IP in .env is unreachable from the browser,
// so fall back to localhost. On mobile, use the EXPO_PUBLIC_ env var which
// contains the LAN IP so the phone can reach the PC over WiFi.
const API_URL =
  Platform.OS === 'web'
    ? 'http://localhost:8000/api'
    : (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api');

// ── Session ID ───────────────────────────────────────────────────────────────
const generateSessionId = () =>
  `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
let currentSessionId = generateSessionId();

export const resetSession = () => {
  currentSessionId = generateSessionId();
};

// ── Fetch with abort-based timeout ──────────────────────────────────────────
const fetchWithTimeout = (url, options, timeout = 120000) => {
  const controller  = new AbortController();
  const fetchPromise = fetch(url, { ...options, signal: controller.signal });
  const timeoutId   = setTimeout(() => controller.abort(), timeout);
  return fetchPromise.finally(() => clearTimeout(timeoutId));
};

// ── Main query function ──────────────────────────────────────────────────────
export const submitQuery = async (query) => {
  const fullUrl = `${API_URL}/query`;

  let authHeader     = {};
  let loggedInUserId = 'anonymous_user';
  let userRole       = 'beginner';
  let userEmail      = 'unknown';

  try {
    const userJson = await AsyncStorage.getItem('user');
    const user     = userJson ? JSON.parse(userJson) : null;
    if (user?.token) authHeader = { Authorization: `Bearer ${user.token}` };
    if (user) {
      loggedInUserId = user.uid || user.id || user.email || 'anonymous_user';
      userRole       = user.role  || 'beginner';
      userEmail      = user.email || 'unknown';
    }
  } catch (e) {
    console.warn('[API] Failed to load auth token:', e);
  }

  try {
    const response = await fetchWithTimeout(
      fullUrl,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body:    JSON.stringify({
          query,
          userId:    loggedInUserId,
          sessionId: currentSessionId,
          role:      userRole,
        }),
      },
      120000
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // ── Firebase logging (non-blocking) ─────────────────────────────────────
    try {
      await addDoc(collection(db, 'Alerts'), {
        type:        'info',
        icon:        '🔍',
        title:       'Query Submitted',
        message:     `${userRole.toUpperCase()} asked: "${query.slice(0, 100)}"`,
        status:      'Logged',
        statusColor: '#16a34a',
        statusBg:    '#dcfce7',
        userEmail,
        role:        userRole,
        sources:     data.sources || [],
        createdAt:   serverTimestamp(),
      });

      if (data.alert) {
        const isCritical = data.alert.level === 'critical';
        await addDoc(collection(db, 'Alerts'), {
          type:        'alert',
          icon:        data.alert.icon,
          title:       data.alert.title,
          message:     `${userRole.toUpperCase()} · "${query.slice(0, 80)}" — ${data.alert.reason}`,
          status:      isCritical ? 'Requires Immediate Review' : 'Pending Review',
          statusColor: isCritical ? '#dc2626' : '#d97706',
          statusBg:    isCritical ? '#fef2f2' : '#fffbeb',
          userEmail,
          role:        userRole,
          sources:     data.sources || [],
          createdAt:   serverTimestamp(),
        });
        console.log(`[ALERT AGENT] ${data.alert.level.toUpperCase()} alert logged`);
      }
    } catch (e) {
      console.warn('[API] Alert log error:', e.message);
    }

    return data;
  } catch (err) {
    throw err;
  }
};