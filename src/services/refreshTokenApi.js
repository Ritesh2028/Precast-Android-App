import axios from 'axios';
import { getTokens, setTokens } from './tokenManager';
import { API_BASE_URL } from '../config/apiConfig';

/**
 * Call the refresh-token API and persist new tokens.
 * Used by authService.refreshSession and tokenRefreshService to avoid a require cycle.
 * @returns {{ access_token, refresh_token, expires_in } | null}
 */
export async function doRefreshToken() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  const res = await axios.post(
    `${API_BASE_URL}/api/refresh-token`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const newAccess = res?.data?.access_token;
  const newRefresh = res?.data?.refresh_token ?? refreshToken;
  const expiresIn = res?.data?.expires_in;

  if (!newAccess) return res?.data ?? null;

  await setTokens({ accessToken: newAccess, refreshToken: newRefresh, expiresIn });
  return res.data;
}
