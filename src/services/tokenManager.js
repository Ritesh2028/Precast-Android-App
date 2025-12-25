import { 
  saveAccessToken, 
  saveRefreshToken, 
  getAccessToken, 
  getRefreshToken, 
  clearTokens,
  saveAccessTokenExpiry,
  getAccessTokenExpiry,
} from './secureStorage';

export async function setTokens({ accessToken, refreshToken, expiresIn }) {
  const promises = [
    saveAccessToken(accessToken),
    saveRefreshToken(refreshToken),
  ];
  
  // Calculate and store expiration time if expiresIn is provided (in seconds)
  if (expiresIn && accessToken) {
    // expiresIn is in seconds, convert to milliseconds and add to current time
    const expiryTimestamp = Date.now() + (expiresIn * 1000);
    promises.push(saveAccessTokenExpiry(expiryTimestamp));
  }
  
  await Promise.all(promises);
}

export async function getTokens() {
  const [accessToken, refreshToken, expiryTimestamp] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getAccessTokenExpiry(),
  ]);
  return { accessToken, refreshToken, expiryTimestamp };
}

export async function clearAllTokens() {
  await clearTokens();
}

// Check if access token is expired or will expire soon (within 1 minute)
export async function isAccessTokenExpired() {
  const { expiryTimestamp } = await getTokens();
  if (!expiryTimestamp) return true; // If no expiry stored, consider expired
  
  // Check if token expires within the next 1 minute (60 seconds buffer)
  const now = Date.now();
  const bufferTime = 60 * 1000; // 1 minute in milliseconds
  return expiryTimestamp <= (now + bufferTime);
}


