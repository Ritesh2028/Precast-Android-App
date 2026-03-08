import api from './apiClient';
import axios from 'axios';
import { setTokens, getTokens, clearAllTokens } from './tokenManager';
import { stopTokenRefreshService } from './tokenRefreshService';
import { doRefreshToken } from './refreshTokenApi';
import { API_BASE_URL } from '../config/apiConfig';

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
  try {
    const result = await doRefreshToken();
    if (!result?.access_token) {
      if (result?.error) {
        console.error('❌ [refreshSession] No access_token in response:', result);
      }
      return result ?? null;
    }
    return result;
  } catch (error) {
    console.error('❌ [refreshSession] Error refreshing token:', error?.message);
    throw error;
  }
}

export async function logout() {
  stopTokenRefreshService();
  await clearAllTokens();
}


