// // src/services/api.js (React Native / Expo version)
// import axios from 'axios';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// // Hardcoded for testing – your PC's local IP and Node backend port
// const API_BASE_URL = 'http://192.168.1.67:8000/api';

// const api = axios.create({
//   baseURL: API_BASE_URL,
//   headers: { 'Content-Type': 'application/json' },
//   timeout: 10000, // 10 seconds
// });

// // Attach auth token from AsyncStorage (if available)
// api.interceptors.request.use(async (config) => {
//   console.log('🔗 Axios request to:', config.baseURL + config.url);
//   console.log('🔗 Full config URL:', config.url);
//   try {
//     const userJson = await AsyncStorage.getItem('user');
//     const user = userJson ? JSON.parse(userJson) : null;
//     if (user?.token) {
//       config.headers.Authorization = `Bearer ${user.token}`;
//     }
//   } catch (e) {
//     console.warn('Failed to load auth token', e);
//   }
//   return config;
// });

// export const submitQuery = async (query) => {
//   console.log('🌐 Full URL:', `${API_BASE_URL}/query`);  // already have this
//   console.log('🌐 API_BASE_URL value:', API_BASE_URL);    // add this
//   try {
//     const response = await api.post('/query', { query });
//     console.log('Response received:', response.data);
//     return response.data;
//   } catch (err) {
//     console.error('Axios error:', err.message);
//     if (err.response) {
//       console.error('Response status:', err.response.status);
//       console.error('Response data:', err.response.data);
//     } else if (err.request) {
//       console.error('No response received (network error)');
//     }
//     throw err;
//   }
// };