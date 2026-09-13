import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
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

export const resetSession = () => {
  currentSessionId = generateSessionId();
  console.log('[API] New session:', currentSessionId);
};

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
 * @param {string} [options.imageBase64]    JPEG as raw base64, no data-URL prefix
 * @param {string} [options.confirmedModel] machine confirmed in this chat
 * @param {boolean} [options.voice]         ask for a spoken form of the answer
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
    imageBase64 = null,
    confirmedModel = null,
    voice = false,
  } = opts;

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
  if (imageBase64) console.log('[API] Photo attached:', Math.round((imageBase64.length * 3) / 4 / 1024), 'KB');
  if (confirmedModel) console.log('[API] Confirmed model:', confirmedModel);

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
          ...(imageBase64 ? { imageBase64 } : {}),
          ...(confirmedModel ? { confirmedModel } : {}),
          ...(voice ? { voice: true } : {}),
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

      const err = new Error(decodeEntities(message));
      err.status = response.status;
      err.code = errBody?.code || null;
      err.retryable = Boolean(errBody?.retryable);
      err.imageAttached = Boolean(errBody?.imageAttached || imageBase64);
      throw err;
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
          imageAttached: Boolean(imageBase64),
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

  console.log('[API] Sending audio to:', fullUrl);

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