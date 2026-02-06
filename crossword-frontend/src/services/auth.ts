import axios from 'axios';
import { getLocalSessions, clearLocalSessions } from '../utils/sessionManager';

const API_URL = '/api/auth';
const TOKEN_KEY = 'cryptic_share_token';

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export const removeAuthToken = () => localStorage.removeItem(TOKEN_KEY);

// Axios interceptor to add token
axios.interceptors.request.use(config => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = async (username: string, password: string) => {
  const response = await axios.post(`${API_URL}/login`, { username, password });
  if (response.data.token) {
    setAuthToken(response.data.token);
  }
  return response.data;
};

export const register = async (username: string, password: string) => {
  const response = await axios.post(`${API_URL}/register`, { username, password });
  if (response.data.token) {
    setAuthToken(response.data.token);
  }
  return response.data;
};

export const logout = () => {
  removeAuthToken();
};

export const getMe = async () => {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const response = await axios.get(`${API_URL}/me`);
    return response.data.user;
  } catch {
    removeAuthToken(); // Invalid token
    return null;
  }
};

export const syncSessions = async () => {
  const localSessions = getLocalSessions();
  const sessionIds = localSessions.map(s => s.sessionId);
  if (sessionIds.length === 0) return;

  await axios.post('/api/sessions/sync', { sessionIds });
  clearLocalSessions();
};

export const fetchUserSessions = async () => {
  const response = await axios.get('/api/sessions');
  return response.data;
};
