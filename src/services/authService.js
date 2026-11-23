import api from './apiClient';
import { setTokens, getTokens, clearAllTokens } from './tokenManager';
import { startTokenRefreshService, stopTokenRefreshService } from './tokenRefreshService';
import { doRefreshToken } from './refreshTokenApi';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { removePushNotifications } from './pushNotifications';

let accessSnapshot = null;

export function getAccessSnapshot() {
  return accessSnapshot;
}

export function setAccessSnapshot(snapshot) {
  accessSnapshot = snapshot || null;
}

const LOGIN_TIMEOUT_MS = 25000;
const IP_FALLBACK = '0.0.0.0';

function logLoginError(label, error, extra = {}) {
  console.error(`❌ [authService] ${label}`, {
    message: error?.message,
    code: error?.code,
    status: error?.response?.status ?? error?.status,
    data: error?.response?.data ?? error?.data,
    ...extra,
  });
}

/** Fetch client public IP; backend requires ip on login (fallback 0.0.0.0 per web app). */
export async function getClientIp() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return IP_FALLBACK;
    const json = await response.json();
    return json?.ip || IP_FALLBACK;
  } catch {
    return IP_FALLBACK;
  }
}

export async function login({ email, password, ip }) {
  const url = `${API_BASE_URL}/api/login`;
  const clientIp = ip || IP_FALLBACK;
  const payload = { email: email.trim(), password, ip: clientIp };

  console.log('📱 [authService] Login request', {
    url,
    email: payload.email,
    ip: clientIp,
  });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startedAt;
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    console.log('📱 [authService] Login response', {
      status: response.status,
      elapsedMs,
      hasAccessToken: Boolean(data?.access_token),
      role: data?.role ?? data?.role_name ?? data?.user_role ?? null,
      error: data?.error ?? data?.message ?? null,
    });

    if (!response.ok) {
      const err = new Error(data?.error || data?.message || `Login failed (${response.status})`);
      err.response = { status: response.status, data };
      err.status = response.status;
      err.data = data;
      throw err;
    }

    if (!data?.access_token) {
      const contentType = response.headers?.get?.('content-type') || '';
      const err = new Error(
        contentType.includes('json')
          ? data?.error || data?.message || 'Login failed: No access token received'
          : `Login server returned a non-JSON response (${contentType || 'unknown type'}). Check API_BASE_URL (${API_BASE_URL}).`
      );
      err.response = { status: response.status, data };
      throw err;
    }

    const accessToken = data?.access_token;
    const refreshToken = data?.refresh_token;
    const expiresIn = data?.expires_in;
    await setTokens({ accessToken, refreshToken, expiresIn });
    startTokenRefreshService();
    return data;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const isAbort = error?.name === 'AbortError';
    logLoginError(isAbort ? 'Login timed out' : 'Login failed', error, {
      url,
      elapsedMs,
    });
    if (isAbort) {
      const timeoutError = new Error('Connection timed out. Check your internet and try again.');
      timeoutError.code = 'ECONNABORTED';
      throw timeoutError;
    }
    if (error?.message === 'Network request failed' || error?.message === 'Network Error') {
      const networkError = new Error(
        `Cannot reach ${API_BASE_URL}. Check your internet connection.`
      );
      networkError.code = 'ENETUNREACH';
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getUser() {
  const res = await api.get('/api/get_user');
  return res.data;
}

export async function getNavigation() {
  const res = await api.get('/api/navigation');
  return res.data;
}

/** Re-read qc + role from the token-login shortcut (no new session). */
export async function loginWithStoredToken() {
  const { accessToken } = await getTokens();
  if (!accessToken) return null;

  const response = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
    body: JSON.stringify({}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(data?.error || data?.message || `Session check failed (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function validateSession() {
  const { accessToken } = await getTokens();
  if (!accessToken) return { valid: false };
  const res = await api.post('/api/validate-session', {});
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
  setAccessSnapshot(null);
  await removePushNotifications();

  const { accessToken } = await getTokens();
  if (accessToken) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`${API_BASE_URL}/api/logout`, {
        method: 'POST',
        headers: createAuthHeaders(accessToken),
        signal: controller.signal,
      });
    } catch {
      // Always clear local tokens even if the server logout fails.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  await clearAllTokens();
}


