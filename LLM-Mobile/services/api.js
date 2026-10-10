// LLM-Mobile\services\api.js

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { db } from '../firebaseConfig';
import { FEATURES } from '../constants/featureFlags';
import { detailRequestFields } from '../utils/responseDetail';

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
  return currentSessionId;
};

// Point the API at an existing chat's session (used when switching chats).
// Falls back to the current session if the chat predates sessionId tracking.
export const setSession = (sessionId) => {
  if (!sessionId) return currentSessionId;
  currentSessionId = sessionId;
  return currentSessionId;
};

export const getSession = () => currentSessionId;

// ─────────────────────────────────────────────
// FETCH WITH TIMEOUT
// ─────────────────────────────────────────────

// `options.signal` lets the caller cancel. A caller cancel and a timeout both
// surface as AbortError, so the error is tagged `cancelled` when the caller
// asked for it - otherwise a user pressing Cancel would be told the server
// timed out.
const fetchWithTimeout = (url, options = {}, timeout = 120000) => {
  const { signal: callerSignal, ...rest } = options;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort);
  }

  return fetch(url, {
    ...rest,
    signal: controller.signal,
  }).catch((error) => {
    if (error?.name === 'AbortError' && callerSignal?.aborted) error.cancelled = true;
    throw error;
  }).finally(() => {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener?.('abort', onCallerAbort);
  });
};

// ─────────────────────────────────────────────
// DOCUMENT / MODEL FILTERS
// GET /api/documents
// ─────────────────────────────────────────────

export const getFilters = async () => {
  const fullUrl = `${API_URL}/documents`;
  console.log('[API] Fetching filters from:', fullUrl);   // ← ADD THIS
  console.log('[API] EXPO_PUBLIC_API_URL =', process.env.EXPO_PUBLIC_API_URL);  // ← AND THIS

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
// RESPONSE TEXT
// ─────────────────────────────────────────────

// The backend HTML-escapes every string it returns. Markdown rendering decodes
// these on screen, but plain Text and text-to-speech do not - a spoken answer
// would otherwise read "ampersand hash 39" aloud.
export const decodeEntities = (text) =>
  typeof text === 'string'
    ? text
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    : text;

// ─────────────────────────────────────────────
// MAIN COPILOT QUERY
// ─────────────────────────────────────────────

/**
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.docGroup]       manual selected in the filter
 * @param {string[]} [options.images]      up to 4 JPEGs as raw base64, no data-URL prefix
 * @param {string} [options.imageBase64]    a single photo (older form of `images`)
 * @param {string} [options.confirmedModel] machine confirmed in this chat
 * @param {boolean} [options.voice]         ask for a spoken form of the answer
 * @param {'brief'|'standard'|'detailed'} [options.detail] response detail; ignored for voice
 * @param {{ text: string, messageId?: string }} [options.quote]
 *                                          a passage from an earlier answer this
 *                                          question is about
 * @param {AbortSignal} [options.signal]    cancels the request; the thrown error
 *                                          then has `cancelled: true`
 *
 * Also accepts a document group string as the second argument, the original
 * signature.
 *
 * Failed requests throw an Error carrying `code`, `retryable`, `imageAttached`
 * and `status` from the server, so the app can offer Retry or Retake.
 */
export const submitQuery = async (query, options = {}) => {
  const opts = options === null || typeof options === 'string' ? { docGroup: options } : options;
  const {
    docGroup = null,
    images: imageList = null,
    imageBase64: singleImage = null,
    confirmedModel = null,
    voice = false,
    detail = 'standard',
    quote = null,
    signal = undefined,
  } = opts;
  const images = imageList?.length ? imageList : singleImage ? [singleImage] : [];
  const imageBase64 = images.length > 0;

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


  if (imageBase64) {
    const kb = images.reduce((sum, b64) => sum + (b64.length * 3) / 4, 0) / 1024;

  }


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
          ...(imageBase64 ? { images } : {}),
          ...(confirmedModel ? { confirmedModel } : {}),
          ...(voice ? { voice: true } : {}),
          ...detailRequestFields({ detail, voice, enabled: FEATURES.EFFORT_LEVELS }),
          ...(quote?.text ? { quote: { text: quote.text, ...(quote.messageId ? { messageId: String(quote.messageId) } : {}) } } : {}),
        }),
        signal,
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

      const err = new Error(decodeEntities(message));
      err.status = response.status;
      err.code = errBody?.code || null;
      err.retryable = Boolean(errBody?.retryable);
      err.imageAttached = Boolean(errBody?.imageAttached || imageBase64);
      throw err;
    }

    const data = await response.json();

  

    if (data?.sources) {

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
          imageAttached: imageBase64,
          imageCount: images.length,
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
            `${data.alert.reason || ''} · Query: ${query.slice(0, 80)}`,
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
    if (error?.cancelled) {
      const err = new Error('Request cancelled.');
      err.code = 'cancelled';
      err.cancelled = true;
      throw err;
    }
    if (error?.name === 'AbortError') {
      console.error('[API] Request timed out:', fullUrl);

      const err = new Error(
        'Request timed out. Please check that the backend and retrieval service are running.'
      );
      err.code = 'timeout';
      err.retryable = true;
      err.imageAttached = Boolean(imageBase64);
      throw err;
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



  const formData = new FormData();

  // SDK 57 installs expo/fetch as the global fetch, and its FormData encoder
  // rejects React Native's { uri, name, type } parts with "Unsupported
  // FormDataPart implementation". It accepts objects that expose bytes(),
  // which expo-file-system's File does. The server renames the upload to
  // audio.m4a before transcription, so the part's filename is not load-bearing.
  if (Platform.OS === 'web') {
    formData.append('audio', {
      uri: localUri,
      name: 'recording.m4a',
      type: 'audio/m4a',
    });
  } else {
    const recording = new File(localUri);
    // Fail with a clear message if the recorder produced nothing, rather than
    // uploading an empty part and getting an opaque transcription error back.
    if (!recording.exists || !recording.size) {
      throw new Error('The recording is empty. Hold the mic a little longer and try again.');
    }
    formData.append('audio', recording);
  }

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


// ─────────────────────────────────────────────
// USER ADMINISTRATION
// ─────────────────────────────────────────────

// Deletes a user completely: the Firebase Auth account and the Firestore
// record. This has to go through the backend because the client SDK cannot
// delete another account's Auth record — only the Admin SDK can. Deleting the
// Firestore document alone left the email address permanently claimed.
export const deleteUserCompletely = async (uid) => {
  if (!uid) throw new Error('No user id supplied.');

  const userJson = await AsyncStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (!user?.token) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetchWithTimeout(
    `${API_URL}/users/${encodeURIComponent(uid)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${user.token}` } },
    20000
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Delete failed (HTTP ${response.status})`);
  return body;
};


// Names a chat from its first exchange. Deliberately forgiving: a failed title
// must never disturb the conversation, so the caller keeps its fallback.
export const generateChatTitle = async (question, answer) => {
  const response = await fetchWithTimeout(
    `${API_URL}/chat-title`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Truncated here, not just server-side: the sanitize middleware rejects
      // any field over 1000 characters with a 400, and a real answer is
      // routinely longer than that. The title only needs the opening of each.
      body: JSON.stringify({
        question: String(question || '').slice(0, 400),
        answer: String(answer || '').slice(0, 400),
      }),
    },
    15000
  );
  if (!response.ok) throw new Error(`Title failed (HTTP ${response.status})`);
  const data = await response.json();
  return (data.title || '').trim();
};


// Sets another user's password. Admin-only and server-side: the client SDK can
// only change the password of the account it is signed in as.
export const setUserPassword = async (uid, password) => {
  if (!uid) throw new Error('No user id supplied.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  const userJson = await AsyncStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (!user?.token) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetchWithTimeout(
    `${API_URL}/users/${encodeURIComponent(uid)}/password`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ password }),
    },
    20000
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Password update failed (HTTP ${response.status})`);
  return body;
};
