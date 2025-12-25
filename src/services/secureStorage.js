import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const ACCESS_TOKEN_EXPIRY_KEY = 'auth.accessTokenExpiry';

export async function saveAccessToken(token) {
  if (!token) return;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function saveRefreshToken(token) {
  if (!token) return;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getAccessToken() {
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveAccessTokenExpiry(expiryTimestamp) {
  if (!expiryTimestamp) return;
  await SecureStore.setItemAsync(ACCESS_TOKEN_EXPIRY_KEY, String(expiryTimestamp), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function getAccessTokenExpiry() {
  const expiry = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_EXPIRY_KEY);
}

export const secureStorageKeys = {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  ACCESS_TOKEN_EXPIRY_KEY,
};


