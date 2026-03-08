/**
 * Validate a JWT token locally by checking its structure and expiration.
 * @param {string} token - JWT access token
 * @returns {boolean} true if the token is structurally valid and not expired
 */
export function validateToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
