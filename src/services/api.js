import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token if needed
api.interceptors.request.use((config) => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user?.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

export const submitQuery = async (query) => {
  const user = JSON.parse(localStorage.getItem('user'));
  const role = user?.role || 'beginner';
  const response = await api.post('/query', { query, role });
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
