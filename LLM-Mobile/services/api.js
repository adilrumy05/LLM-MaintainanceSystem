import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token if needed
api.interceptors.request.use(async (config) => {
  const raw  = await AsyncStorage.getItem('user');
  const user = JSON.parse(raw || '{}');
  if (user?.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

export const submitQuery = async (query) => {
  const response = await api.post('/query', { query });
  return response.data;
};

export const approveRecommendation = async (taskId) => {
  const response = await api.post('/approve', { taskId });
  return response.data;
};

export const rejectRecommendation = async (taskId) => {
  const response = await api.post('/reject', { taskId });
  return response.data;
};