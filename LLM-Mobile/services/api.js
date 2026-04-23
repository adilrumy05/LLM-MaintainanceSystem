// services/api.js (fetch version – no axios)
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://172.20.10.4:8000/api';

const fetchWithTimeout = (url, options, timeout = 120000) => {
  const controller = new AbortController();
  const fetchPromise = fetch(url, { ...options, signal: controller.signal });
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetchPromise.finally(() => clearTimeout(timeoutId));
};

export const submitQuery = async (query) => {
  const fullUrl = `${API_BASE_URL}/query`;
  console.log('🌐 FETCH VERSION: Full URL:', fullUrl);

  let authHeader = {};
  let loggedInUserId = "anonymous_user"; // <-- Setup a default

  try {
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    
    if (user?.token) {
      authHeader = { 'Authorization': `Bearer ${user.token}` };
    }
    
    // Grab the ID from the stored user object (handles Firebase 'uid' or standard 'id')
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
      // Include the userId in the payload sent to the backend
      body: JSON.stringify({ query, userId: loggedInUserId }), 
    }, 120000);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = JSON.stringify(errorData);
      } catch {
        errorDetail = await response.text();
      }
      throw new Error(`HTTP ${response.status}: ${errorDetail}`);
    }

    const data = await response.json();
    console.log('✅ Fetch response:', data);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('❌ Fetch timeout (120s)');
    } else {
      console.error('❌ Fetch error:', err.message);
    }
    throw err;
  }
};