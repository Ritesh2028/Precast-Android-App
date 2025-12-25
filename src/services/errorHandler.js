import { refreshSession } from './authService';
import { logout } from './authService';
import { getTokens } from './tokenManager';

/**
 * Handle 401 authentication errors gracefully
 * Tries to refresh token first, only logs out if refresh fails
 * @param {Response} response - The failed API response
 * @param {Function} retryCallback - Optional callback to retry the original request with new token
 * @param {Object} navigation - Navigation object for redirecting to login if needed
 * @returns {Promise<boolean>} - Returns true if should retry, false if should stop
 */
export async function handle401Error(response, retryCallback = null, navigation = null) {
  try {
    console.log('401 error detected, attempting token refresh...');
    
    // Check if we have refresh token
    const { refreshToken } = await getTokens();
    if (!refreshToken) {
      console.log('No refresh token available, need to login');
      if (navigation) {
        await logout();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
      return false;
    }
    
    // Try to refresh the token
    const refreshResult = await refreshSession();
    
    if (refreshResult && (refreshResult.access_token || refreshResult.message)) {
      console.log('Token refreshed successfully');
      
      // If retry callback provided, retry the request
      if (retryCallback && typeof retryCallback === 'function') {
        try {
          return await retryCallback();
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          return false;
        }
      }
      
      return true; // Indicate that retry is possible
    } else {
      throw new Error('Token refresh failed - no access token in response');
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    
    // Only logout if we're sure the session is invalid
    // Check if we still have tokens
    const { accessToken, refreshToken } = await getTokens();
    
    if (!accessToken && !refreshToken) {
      // No tokens at all, definitely need to login
      if (navigation) {
        await logout();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
      return false;
    }
    
    // If we have tokens but refresh failed, it might be a temporary issue
    // Don't logout immediately, let the user continue
    // The token refresh service will handle it automatically
    console.log('Token refresh failed but tokens exist - may be temporary issue, continuing...');
    return false;
  }
}

/**
 * Check if error response indicates authentication failure
 * @param {Response} response - API response
 * @returns {boolean}
 */
export function isAuthError(response) {
  return response && response.status === 401;
}

/**
 * Handle API errors gracefully without logging out immediately
 * @param {Response} response - API response
 * @param {string} context - Context for logging (e.g., 'Projects API', 'Tasks API')
 * @returns {Promise<Object>} - Error information
 */
export async function handleApiError(response, context = 'API') {
  const errorText = await response.text().catch(() => 'Unknown error');
  let errorData = {};
  
  try {
    errorData = JSON.parse(errorText);
  } catch {
    errorData = { message: errorText, error: errorText };
  }
  
  console.log(`${context} Error (${response.status}):`, errorData);
  
  return {
    status: response.status,
    data: errorData,
    message: errorData.message || errorData.error || `Request failed with status ${response.status}`,
  };
}

