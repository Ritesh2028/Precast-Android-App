import api from './apiClient';
import axios from 'axios';
import { setTokens, getTokens, clearAllTokens } from './tokenManager';
import { stopTokenRefreshService } from './tokenRefreshService';
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
  const { refreshToken } = await getTokens();
    if (!refreshToken) {
      console.log('⚠️ [refreshSession] No refresh token available');
      return null;
    }
    
  const payload = { refresh_token: refreshToken };
    console.log('🔄 [refreshSession] Attempting to refresh token...');
    
    // Use axios.post directly to bypass the interceptor and avoid refresh loops
    // The interceptor would try to refresh again if this endpoint returns 401
    const res = await axios.post(`${API_BASE_URL}/api/refresh-token`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    
  // New API response: { access_token, refresh_token, expires_in, message }
  const newAccess = res?.data?.access_token;
  const newRefresh = res?.data?.refresh_token || refreshToken; // Use new refresh token if provided, otherwise keep old one
  const expiresIn = res?.data?.expires_in; // expires_in is in seconds (900 = 15 minutes)
    
    if (!newAccess) {
      console.error('❌ [refreshSession] No access_token in response:', {
        hasData: !!res?.data,
        dataKeys: res?.data ? Object.keys(res?.data) : 'no data',
        responseStatus: res?.status,
        responseData: res?.data,
      });
      // Return the response data anyway so errorHandler can inspect it
      return res?.data || { error: 'No access_token in response' };
    }
    
    await setTokens({ accessToken: newAccess, refreshToken: newRefresh, expiresIn });
    console.log('✅ [refreshSession] Token refreshed successfully');
  return res.data;
  } catch (error) {
    console.error('❌ [refreshSession] Error refreshing token:', {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
    });
    
    // Re-throw the error so errorHandler can catch it
    throw error;
  }
}

export async function logout() {
  stopTokenRefreshService();
  await clearAllTokens();
}


