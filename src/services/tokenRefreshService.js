import { isAccessTokenExpired, getTokens } from './tokenManager';
import { doRefreshToken } from './refreshTokenApi';

let refreshInterval = null;
let isRunning = false;
const REFRESH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MIN_REFRESH_INTERVAL_MS = 2 * 60 * 1000; // don't refresh more than once per 2 minutes
let lastRefreshAt = 0;

/**
 * Start the token refresh service that checks token validity every 5 minutes
 * and automatically refreshes the access token when it expires.
 * Idempotent: safe to call multiple times.
 */
export function startTokenRefreshService() {
  if (isRunning) return;
  isRunning = true;
  refreshInterval = null;

  checkAndRefreshToken();

  refreshInterval = setInterval(() => {
    checkAndRefreshToken();
  }, REFRESH_CHECK_INTERVAL);

  console.log('🔄 Token refresh service started (checking every 5 minutes)');
}

/**
 * Stop the token refresh service
 */
export function stopTokenRefreshService() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  isRunning = false;
  lastRefreshAt = 0;
}

/**
 * Check if access token is expired and refresh it if needed.
 * Throttled: skips refresh if we refreshed in the last MIN_REFRESH_INTERVAL_MS.
 */
async function checkAndRefreshToken() {
  try {
    const { accessToken, refreshToken } = await getTokens();

    if (!accessToken || !refreshToken) {
      stopTokenRefreshService();
      return;
    }

    const now = Date.now();
    if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
      return; // throttle: avoid refresh storm
    }

    const isExpired = await isAccessTokenExpired();
    if (!isExpired) return;

    try {
      const result = await doRefreshToken();
      if (result?.access_token) {
        lastRefreshAt = Date.now();
      }
    } catch {
      // Network or server error -- silently skip; will retry next interval
    }
  } catch {
    // Token read error -- silently skip
  }
}

/**
 * Manually trigger a token refresh check
 */
export async function manualTokenRefresh() {
  await checkAndRefreshToken();
}

