import axios from 'axios';
import { getTokens, setTokens, clearAllTokens } from './tokenManager';
import { API_BASE_URL } from '../config/apiConfig';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

let isRefreshing = false;
let pendingQueue = [];

function processQueue(error, token) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
}

api.interceptors.request.use(async (config) => {
  const { accessToken } = await getTokens();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        })
          .then((newAccess) => {
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            return api.request(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      try {
        const { refreshToken } = await getTokens();
        if (!refreshToken) throw error;

        // Use refresh-token endpoint with refresh_token payload
        const payload = { refresh_token: refreshToken };
        const refreshRes = await axios.post(`${API_BASE_URL}/api/refresh-token`, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        // New API response: { access_token, refresh_token, expires_in, message }
        const newAccess = refreshRes?.data?.access_token;
        const newRefresh = refreshRes?.data?.refresh_token || refreshToken; // Use new refresh token if provided, otherwise keep old one
        const expiresIn = refreshRes?.data?.expires_in; // expires_in is in seconds (900 = 15 minutes)
        if (!newAccess) throw error;

        await setTokens({ accessToken: newAccess, refreshToken: newRefresh, expiresIn });
        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api.request(originalRequest);
      } catch (e) {
        processQueue(e, null);
        await clearAllTokens();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;


