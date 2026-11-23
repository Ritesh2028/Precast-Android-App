// Production API and web app.
// app.precastezy.com is the CloudFront-hosted SPA: it answers every path
// (including POST /api/*) with index.html, so API calls must go to the
// api. host — same as the web frontend's VITE_API_URL in deploy.yml.
export const API_BASE_URL = 'https://api.precastezy.com';
export const WEB_URL = 'https://app.precastezy.com/';

/**
 * Build standard JSON headers for API requests.
 * Match web: send raw JWT in Authorization (no Bearer) by default.
 * Backend NormalizeSessionToken accepts both formats.
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

/**
 * Auth headers for multipart FormData uploads.
 * Must NOT set Content-Type — React Native adds multipart/form-data + boundary.
 */
export const createMultipartAuthHeaders = (token, options = {}) => {
  const headers = createAuthHeaders(token, options);
  delete headers['Content-Type'];
  return headers;
};


