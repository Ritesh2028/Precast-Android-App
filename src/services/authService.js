import api from './apiClient';
import { setTokens, getTokens, clearAllTokens } from './tokenManager';
import { stopTokenRefreshService } from './tokenRefreshService';

export async function login({ email, password, ip }) {
  const res = await api.post('/api/login', {
    email,
    password,
    ...(ip ? { ip } : {}),
  });
  // New API response: { access_token, refresh_token, expires_in, message, role }
  const accessToken = res?.data?.access_token;
  const refreshToken = res?.data?.refresh_token;
  const expiresIn = res?.data?.expires_in; // expires_in is in seconds (900 = 15 minutes)
  await setTokens({ accessToken, refreshToken, expiresIn });
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
  const payload = { refresh_token: refreshToken };
  const res = await api.post('/api/refresh-token', payload);
  // New API response: { access_token, refresh_token, expires_in, message }
  const newAccess = res?.data?.access_token;
  const newRefresh = res?.data?.refresh_token || refreshToken; // Use new refresh token if provided, otherwise keep old one
  const expiresIn = res?.data?.expires_in; // expires_in is in seconds (900 = 15 minutes)
  if (newAccess) await setTokens({ accessToken: newAccess, refreshToken: newRefresh, expiresIn });
  return res.data;
}

export async function logout() {
  stopTokenRefreshService();
  await clearAllTokens();
}


