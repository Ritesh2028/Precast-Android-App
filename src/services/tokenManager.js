import { saveAccessToken, saveRefreshToken, getAccessToken, getRefreshToken, clearTokens } from './secureStorage';

export async function setTokens({ accessToken, refreshToken }) {
  await Promise.all([
    saveAccessToken(accessToken),
    saveRefreshToken(refreshToken),
  ]);
}

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);
  return { accessToken, refreshToken };
}

export async function clearAllTokens() {
  await clearTokens();
}


