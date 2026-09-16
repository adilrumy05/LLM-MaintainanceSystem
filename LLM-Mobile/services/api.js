import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';

import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ─────────────────────────────────────────────
// API URL
// ─────────────────────────────────────────────

const getExpoHost = () => {
  try {
    const hostUri = Constants.expoConfig?.hostUri;
    if (!hostUri) return null;

    const cleanedHost = hostUri
      .replace(/^exp:\/\//, '')
      .replace(/^https?:\/\//, '');

    return cleanedHost.split(':')[0];
  } catch (error) {
    console.warn('[API] Could not detect Expo host:', error);
    return null;
  }
};

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:8000/api';
  }

  const expoHost = getExpoHost();

  if (expoHost) {
    return `http://${expoHost}:8000/api`;
  }

  console.warn('[API] Could not detect development PC IP. Using localhost.');
  return 'http://localhost:8000/api';
};

export const API_URL = getApiUrl();

console.log('[API] Platform:', Platform.OS);
console.log('[API] Expo host:', Constants.expoConfig?.hostUri || 'Not detected');
console.log('[API] Backend URL:', API_URL);

// ─────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────

const generateSessionId = () =>
  `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

let currentSessionId = generateSessionId();

// One audit_logs document is keyed by one sessionId, so a session must map to
// a single conversation. Previously this id was generated once at module load
// and never changed — resetSession() was exported but never called — so every
// chat in the sidebar appended into the SAME audit_logs doc. That merged
// unrelated jobs into one record, which breaks both the per-session HITL
// approve/reject flow and any per-repair summary built from the session.
//
// The dashboard now owns the mapping: each chat carries its own sessionId,
// created here on a new chat and re-selected here when switching chats.

// Start a new session and return its id so the caller can store it on a chat.
export const resetSession = () => {
  currentSessionId = generateSessionId();
  console.log('[API] New session:', currentSessionId);
  return currentSessionId;
};

// Point the API at an existing chat's session (used when switching chats).
// Falls back to the current session if the chat predates sessionId tracking.
export const setSession = (sessionId) => {
  if (!sessionId) return currentSessionId;
  currentSessionId = sessionId;
  console.log('[API] Session set:', currentSessionId);
  return currentSessionId;
};

export const getSession = () => currentSessionId;

// ─────────────────────────────────────────────
// FETCH WITH TIMEOUT
// ─────────────────────────────────────────────

const fetchWithTimeout = (url, options = {}, timeout = 120000) => {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
};

// ─────────────────────────────────────────────
// DOCUMENT / MODEL FILTERS
// GET /api/documents
// ─────────────────────────────────────────────

export const getFilters = async () => {
  const fullUrl = `${API_URL}/documents`;

  try {
    const response = await fetchWithTimeout(
      fullUrl,
      { method: 'GET' },
      15000
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[API] Failed to fetch filters:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────
// MAIN COPILOT QUERY
// ─────────────────────────────────────────────

export const submitQuery = async (query, docGroup = null) => {
  const fullUrl = `${API_URL}/query`;

  let authHeader = {};
  let loggedInUserId = 'anonymous_user';
  let userRole = 'beginner';
  let userEmail = 'unknown';

  // Load logged-in user
  try {
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    if (user?.token) {
      authHeader = {
        Authorization: `Bearer ${user.token}`,
      };
    }

    if (user) {
      loggedInUserId =
        user.uid ||
        user.id ||
        user.email ||
        'anonymous_user';

      userRole = user.role || 'beginner';
      userEmail = user.email || 'unknown';
    }
  } catch (error) {
    console.warn('[API] Failed to load auth token:', error);
  }

  console.log('[API] Sending query to:', fullUrl);
  console.log('[API] Role:', userRole);
  console.log('[API] Session:', currentSessionId);
  console.log('[API] Document group:', docGroup || 'ALL');

  try {
    const response = await fetchWithTimeout(
      fullUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          query,
          userId: loggedInUserId,
          userEmail,
          sessionId: currentSessionId,
          role: userRole,

          // Only send when manually selected
          ...(docGroup ? { docGroup } : {}),
        }),
      },
      120000
    );

    // Backend error
    if (!response.ok) {
      const errBody = await response
        .json()
        .catch(() => null);

      const details = errBody?.details;

      const message =
        (typeof details === 'string' && details) ||
        errBody?.error ||
        (details ? JSON.stringify(details) : null) ||
        `HTTP ${response.status}`;

      throw new Error(message);
    }

    const data = await response.json();

    console.log('[API] Query successful');

    if (data?.sources) {
      console.log(
        `[API] Received ${data.sources.length} source(s)`
      );
    }

    // ─────────────────────────────────────────
    // FIREBASE QUERY / ALERT LOGGING
    // ─────────────────────────────────────────

    try {
      await addDoc(
        collection(db, 'Alerts'),
        {
          type: 'info',
          icon: '🔍',
          title: 'Query Submitted',
          message:
            `${userRole.toUpperCase()} asked: ` +
            `"${query.slice(0, 100)}"`,
          status: 'Logged',
          statusColor: '#16a34a',
          statusBg: '#dcfce7',
          userEmail,
          role: userRole,
          sources: data.sources || [],
          createdAt: serverTimestamp(),
        }
      );

      // Agent alert
      if (data.alert) {
        const isCritical = data.alert.level === 'critical';

        await addDoc(
          collection(db, 'Alerts'),
          {
            type: 'alert',
            icon: data.alert.icon || '⚠️',
            title:
              data.alert.title ||
              'Maintenance Alert',
            message:
              `${userRole.toUpperCase()} · ` +
              `"${query.slice(0, 80)}" — ` +
              `${data.alert.reason || ''}`,
            status: isCritical
              ? 'Requires Immediate Review'
              : 'Pending Review',
            statusColor: isCritical
              ? '#dc2626'
              : '#d97706',
            statusBg: isCritical
              ? '#fef2f2'
              : '#fffbeb',
            userEmail,
            role: userRole,
            sources: data.sources || [],
            createdAt: serverTimestamp(),
          }
        );

        console.log(
          `[ALERT AGENT] ${
            data.alert.level?.toUpperCase() || 'UNKNOWN'
          } alert logged`
        );
      }
    } catch (error) {
      // Firebase failure must not break Copilot
      console.warn(
        '[API] Alert log error:',
        error?.message || error
      );
    }

    return data;

  } catch (error) {
    if (error?.name === 'AbortError') {
      console.error('[API] Request timed out:', fullUrl);

      throw new Error(
        'Request timed out. Please check that the backend and retrieval service are running.'
      );
    }

    console.error('[API] Query failed:', error);
    console.error('[API] Attempted backend:', fullUrl);

    throw error;
  }
};

// ─────────────────────────────────────────────
// VOICE INPUT
// ─────────────────────────────────────────────

export const transcribeAudio = async (localUri) => {
  const fullUrl = `${API_URL}/transcribe`;

  console.log('[API] Sending audio to:', fullUrl);

  const formData = new FormData();

  formData.append('audio', {
    uri: localUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  });

  try {
    const response = await fetchWithTimeout(
      fullUrl,
      {
        method: 'POST',
        body: formData,
      },
      60000
    );

    if (!response.ok) {
      let errorMessage =
        `Transcription failed: HTTP ${response.status}`;

      try {
        const errorData = await response.json();

        errorMessage =
          errorData?.error ||
          errorData?.details ||
          errorMessage;
      } catch (_) {
        // Ignore JSON parsing failure
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    return data.text;

  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Voice transcription timed out.');
    }

    console.error(
      '[API] Transcription error:',
      error
    );

    throw error;
  }
};


// ─────────────────────────────────────────────
// REPAIR REPORT
// ─────────────────────────────────────────────

// Ask the backend to summarise one chat session into a structured repair
// report. Generation is server-side so the OpenAI key stays on the backend and
// the stored repair_reports document remains the single traceable source
// behind whatever PDF the technician shares.
export const generateReport = async (sessionId) => {
  if (!sessionId) throw new Error('No session to report on yet.');

  let loggedInUserId = 'anonymous_user';
  let userRole = 'beginner';
  let userEmail = 'unknown';
  let authHeader = {};

  try {
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    if (user?.token) authHeader = { Authorization: `Bearer ${user.token}` };
    if (user) {
      loggedInUserId = user.uid || user.id || user.email || 'anonymous_user';
      userRole = user.role || 'beginner';
      userEmail = user.email || 'unknown';
    }
  } catch (e) {
    console.warn('[API] Could not load user for report:', e);
  }

  // Generation runs an LLM pass over the whole transcript, so it is slower than
  // a chat turn — measured around 6s for an 8-exchange session.
  const response = await fetchWithTimeout(
    `${API_URL}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ sessionId, userId: loggedInUserId, userEmail, role: userRole }),
    },
    120000
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Report failed (HTTP ${response.status})`);
  }
  return response.json();
};

// Fetch a previously generated report, so reopening a job does not pay for a
// second LLM call. Returns null when none exists yet.
export const fetchExistingReport = async (sessionId) => {
  if (!sessionId) return null;
  try {
    const response = await fetchWithTimeout(`${API_URL}/report/${encodeURIComponent(sessionId)}`, {}, 15000);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};


// ─────────────────────────────────────────────
// PROCEDURE TIMERS
// ─────────────────────────────────────────────

// Records a completed wait against the session's audit document. Fire and
// forget from the caller's perspective: the timer already did its job for the
// technician, so a failure here must never surface as an error in their face.
export const logTimerEvent = async (sessionId, event) => {
  if (!sessionId) return null;
  const response = await fetchWithTimeout(
    `${API_URL}/timer-event`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        label: event.label,
        seconds: event.seconds,
        completedAt: event.completed_at,
      }),
    },
    15000
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return response.json();
};
