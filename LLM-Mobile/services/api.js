import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const raw  = await AsyncStorage.getItem('user');
  const user = JSON.parse(raw || '{}');
  if (user?.token) config.headers.Authorization = `Bearer ${user.token}`;
  return config;
});

export const submitQuery = async (query) => {
  const raw  = await AsyncStorage.getItem('user');
  const user = JSON.parse(raw || '{}');
  const role = user?.role || 'beginner';

  const response = await api.post('/query', { query, role });
  const data = response.data;

  // Save real alert to Firestore
  try {
    await addDoc(collection(db, 'Alerts'), {
      type:      'info',
      icon:      '🔍',
      title:     'Query Submitted',
      message:   `${role.toUpperCase()} asked: "${query.slice(0, 100)}"`,
      status:    'Logged',
      statusColor: '#16a34a',
      statusBg:    '#dcfce7',
      userEmail: user?.email || 'unknown',
      role,
      sources:   data.sources || [],
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.log('Alert log error:', e.message);
  }

  return data;
};

export const approveRecommendation = async (taskId) => {
  const response = await api.post('/approve', { taskId });
  return response.data;
};

export const rejectRecommendation = async (taskId) => {
  const response = await api.post('/reject', { taskId });
  return response.data;
};