import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Centralized Export - Now other files can import this!
export const API_BASE_URL = 'http://172.20.10.4:8000/api';

// 2. Generate a unique Session ID when the app first loads
const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
let currentSessionId = generateSessionId();

// Optional: Call this from your UI if you ever add a "New Chat" button!
export const resetSession = () => {
  currentSessionId = generateSessionId();
};

const fetchWithTimeout = (url, options, timeout = 120000) => {
  const controller = new AbortController();
  const fetchPromise = fetch(url, { ...options, signal: controller.signal });
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetchPromise.finally(() => clearTimeout(timeoutId));
};

export const submitQuery = async (query) => {
  const fullUrl = `${API_BASE_URL}/query`;
  
  let authHeader = {};
  let loggedInUserId = "anonymous_user";

  try {
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    
    if (user?.token) {
      authHeader = { 'Authorization': `Bearer ${user.token}` };
    }
    if (user) {
      loggedInUserId = user.uid || user.id || user.email || "anonymous_user";
    }
  } catch (e) {
    console.warn('Failed to load auth token', e);
  }

  try {
    const response = await fetchWithTimeout(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      // 3. Send the sessionId along with the query
      body: JSON.stringify({ 
        query, 
        userId: loggedInUserId,
        sessionId: currentSessionId 
      }), 
    }, 120000);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    throw err;
  }
};