import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// 1. Centralized Export 
import { API_BASE_URL } from '@env';

// 2. Generate a unique Session ID 
const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
let currentSessionId = generateSessionId();

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
  
  let userRole = 'beginner'; 
  let userEmail = 'unknown';

  try {
    const userJson = await AsyncStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    
    if (user?.token) {
      authHeader = { 'Authorization': `Bearer ${user.token}` };
    }
    if (user) {
      loggedInUserId = user.uid || user.id || user.email || "anonymous_user";
      userRole = user.role || 'beginner';
      userEmail = user.email || 'unknown';
    }
  } catch (e) {
    console.warn('Failed to load auth token', e);
  }

  try {
    // 3. YOUR code: Sending the query, user ID, and Session ID to the backend
    const response = await fetchWithTimeout(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ 
        query, 
        userId: loggedInUserId,
        sessionId: currentSessionId,
        role: userRole 
      }), 
    }, 120000);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    try {
      await addDoc(collection(db, 'Alerts'), {
        type:      'info',
        icon:      '🔍',
        title:     'Query Submitted',
        message:   `${userRole.toUpperCase()} asked: "${query.slice(0, 100)}"`,
        status:    'Logged',
        statusColor: '#16a34a',
        statusBg:    '#dcfce7',
        userEmail: userEmail,
        role: userRole,
        sources:   data.sources || [],
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.log('Alert log error:', e.message);
    }

    return data;
  } catch (err) {
    throw err;
  }
};