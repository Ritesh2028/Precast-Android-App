import axios from 'axios';
import { getTokens, setTokens, clearAllTokens } from './tokenManager';

const BASE_URL = 'https://precast.blueinvent.com';

export const api = axios.create({
  baseURL: BASE_URL,
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

        // Use validate-session as refresh endpoint with refresh token payload
        const payload = { SessionData: refreshToken };
        const refreshRes = await axios.post(`${BASE_URL}/api/validate-session`, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        const newAccess = refreshRes?.data?.session_id; // server echoes a JWT in session_id
        if (!newAccess) throw error;

        await setTokens({ accessToken: newAccess, refreshToken });
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


