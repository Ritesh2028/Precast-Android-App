import api from './apiClient';
import { setTokens, getTokens, clearAllTokens } from './tokenManager';

const BASE_URL = 'https://precast.blueinvent.com';

export async function login({ email, password }) {
  // Adjust endpoint and response fields as per backend
  const res = await api.post('/api/login', { email, password });
  // Expecting: { accessToken, refreshToken }
  const accessToken = res?.data?.accessToken || res?.data?.session_id; // fallback if server returns session_id
  const refreshToken = res?.data?.refreshToken || res?.data?.session_id; // if only one token is returned, reuse for refresh
  await setTokens({ accessToken, refreshToken });
  return res.data;
}

export async function validateSession() {
  const { accessToken } = await getTokens();
  if (!accessToken) return { valid: false };
  const payload = { SessionData: accessToken };
  const res = await api.post('/api/validate-session', payload);
  return res.data; // { host_name, message, role_name, session_id }
}

export async function refreshSession() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;
  const payload = { SessionData: refreshToken };
  const res = await api.post('/api/validate-session', payload);
  const newAccess = res?.data?.session_id;
  if (newAccess) await setTokens({ accessToken: newAccess, refreshToken });
  return res.data;
}

export async function logout() {
  await clearAllTokens();
}


