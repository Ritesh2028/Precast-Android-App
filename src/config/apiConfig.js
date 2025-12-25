export const API_BASE_URL = 'https://precast.blueinvent.com';

/**
 * Build standard JSON headers for API requests.
 * Optionally include an auth token and control whether it is sent as a Bearer token.
 */
export const createAuthHeaders = (token, options = {}) => {
  const { useBearer = false, extra = {}, includeSessionId = false } = options;

  const authHeader =
    token != null && token !== ''
      ? { Authorization: useBearer ? `Bearer ${token}` : token }
      : {};

  const sessionHeader =
    includeSessionId && token != null && token !== ''
      ? { session_id: token }
      : {};

  return {
    ...authHeader,
    ...sessionHeader,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'PrecastApp/1.0',
    ...extra,
  };
};


