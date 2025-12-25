import { isAccessTokenExpired, getTokens } from './tokenManager';
import { refreshSession } from './authService';

let refreshInterval = null;
const REFRESH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Start the token refresh service that checks token validity every 5 minutes
 * and automatically refreshes the access token when it expires
 */
export function startTokenRefreshService() {
  // Clear any existing interval
  stopTokenRefreshService();
  
  // Check immediately on start
  checkAndRefreshToken();
  
  // Then check every 5 minutes
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
    console.log('🛑 Token refresh service stopped');
  }
}

/**
 * Check if access token is expired and refresh it if needed
 */
async function checkAndRefreshToken() {
  try {
    const { accessToken, refreshToken } = await getTokens();
    
    // If no tokens exist, stop the service
    if (!accessToken || !refreshToken) {
      console.log('⚠️ No tokens found, stopping refresh service');
      stopTokenRefreshService();
      return;
    }
    
    // Check if access token is expired or about to expire
    const isExpired = await isAccessTokenExpired();
    
    if (isExpired) {
      console.log('🔄 Access token expired or expiring soon, refreshing...');
      try {
        await refreshSession();
        console.log('✅ Access token refreshed successfully');
      } catch (error) {
        console.error('❌ Failed to refresh access token:', error);
        // If refresh fails, stop the service (user will need to login again)
        stopTokenRefreshService();
      }
    } else {
      console.log('✅ Access token is still valid');
    }
  } catch (error) {
    console.error('❌ Error checking token:', error);
  }
}

/**
 * Manually trigger a token refresh check
 */
export async function manualTokenRefresh() {
  await checkAndRefreshToken();
}

