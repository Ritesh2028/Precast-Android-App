import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { getTokens } from '../services/tokenManager';
import { validateToken } from '../services/tokenUtils';
import { validateSession, refreshSession } from '../services/authService';
import { API_BASE_URL } from '../config/apiConfig';

const MAX_REFRESH_RETRIES = 3;

const BirdsEyeViewModal = ({ visible, onClose, projectId }) => {
  const isVisible = !!visible;
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [refreshTokenValue, setRefreshTokenValue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const webViewRef = useRef(null);
  const refreshRetryCount = useRef(0);

  const pageUrl = useMemo(() => {
    if (!projectId) return null;
    return `${API_BASE_URL}/project/${projectId}/bird-eye-view`;
  }, [projectId]);

  const loadAuthToken = useCallback(async () => {
    try {
      const { accessToken, refreshToken } = await getTokens();
      if (!accessToken && !refreshToken) {
        setError('No authentication token found. Please log in again.');
        return null;
      }

      let tokenToUse = accessToken;

      if (!validateToken(accessToken)) {
        if (!refreshToken) {
          setError('Your session has expired. Please log in again.');
          return null;
        }
        const refreshResult = await refreshSession();
        if (!refreshResult || !refreshResult.access_token) {
          setError('Session expired. Please log in again.');
          return null;
        }
        tokenToUse = refreshResult.access_token;
      }

      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          tokenToUse = sessionResult.session_id;
        }
      } catch {
        // use access_token if validation fails
      }

      setAuthToken(tokenToUse);
      setRefreshTokenValue(refreshToken || null);
      setError(null);
      refreshRetryCount.current = 0;
      return tokenToUse;
    } catch (err) {
      setError('Failed to load authentication. Please try again.');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (isVisible && pageUrl) {
      setError(null);
      setIsLoading(true);
      refreshRetryCount.current = 0;
      loadAuthToken().catch(() => {
        setError('Failed to load authentication token. Please try again.');
      });
    } else if (!isVisible) {
      setError(null);
      setAuthToken(null);
      setRefreshTokenValue(null);
      setIsLoading(true);
      refreshRetryCount.current = 0;
    }
  }, [isVisible, pageUrl, loadAuthToken]);

  const escapeForJS = (str) =>
    (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

  // Exact same injected JS pattern as WebViewScreen
  const injectedJavaScript = useMemo(() => {
    if (!authToken) return 'true;';
    const escapedToken = escapeForJS(authToken);
    const escapedRefresh = escapeForJS(refreshTokenValue);

    return `
      (function() {
        try {
          const token = '${escapedToken}';
          const refreshToken = '${escapedRefresh}';
          if (token && token.length > 0) {
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; domain=.blueinvent.com; SameSite=None; Secure';
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; domain=blueinvent.com; SameSite=None; Secure';
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; domain=.blueinvent.com; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; domain=blueinvent.com; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; SameSite=None; Secure';

            try {
              localStorage.setItem('accessToken', token);
              if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
              localStorage.setItem('auth_token', token);
              localStorage.setItem('token', token);
              localStorage.setItem('session_id', token);
              sessionStorage.setItem('auth_token', token);
              sessionStorage.setItem('token', token);
              sessionStorage.setItem('accessToken', token);
              if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);
            } catch(e) {}

            if (window.fetch) {
              const originalFetch = window.fetch;
              window.fetch = function(...args) {
                const [url, options = {}] = args;
                const headers = new Headers(options.headers || {});
                if (!headers.has('Authorization')) {
                  headers.set('Authorization', 'Bearer ' + token);
                }
                if (!headers.has('session_id')) {
                  headers.set('session_id', token);
                }
                options.credentials = options.credentials || 'include';
                return originalFetch(url, { ...options, headers }).then(function(response) {
                  if (response.status === 401 || response.status === 403) {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'TOKEN_REFRESH_REQUIRED',
                        reason: 'fetch_401_error'
                      }));
                    }
                  }
                  return response;
                }).catch(function(error) {
                  if (error && (error.status === 401 || error.status === 403)) {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'TOKEN_REFRESH_REQUIRED',
                        reason: 'fetch_401_error'
                      }));
                    }
                  }
                  throw error;
                });
              };
            }

            if (window.XMLHttpRequest) {
              const originalOpen = XMLHttpRequest.prototype.open;
              const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
              const originalSend = XMLHttpRequest.prototype.send;

              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._authToken = token;
                return originalOpen.apply(this, [method, url, ...rest]);
              };

              XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
                const headerLower = header.toLowerCase();
                if ((headerLower === 'authorization' || headerLower === 'session_id') && !value) {
                  value = this._authToken || token;
                }
                return originalSetRequestHeader.apply(this, [header, value]);
              };

              XMLHttpRequest.prototype.send = function(...args) {
                if (this._authToken) {
                  try {
                    if (!this.getRequestHeader('Authorization')) {
                      this.setRequestHeader('Authorization', 'Bearer ' + this._authToken);
                    }
                    if (!this.getRequestHeader('session_id')) {
                      this.setRequestHeader('session_id', this._authToken);
                    }
                  } catch(e) {}
                }
                var originalOnReadyStateChange = this.onreadystatechange;
                this.onreadystatechange = function() {
                  if (this.readyState === 4 && (this.status === 401 || this.status === 403)) {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'TOKEN_REFRESH_REQUIRED',
                        reason: 'xhr_401_error'
                      }));
                    }
                  }
                  if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                  }
                };
                return originalSend.apply(this, args);
              };
            }

            window.authToken = token;
            window.sessionToken = token;
          }
        } catch(e) {
          console.error('Auth injection error:', e);
        }
        true;
      })();
    `;
  }, [authToken, refreshTokenValue]);

  const tryRefreshAndReload = useCallback(async () => {
    if (refreshRetryCount.current >= MAX_REFRESH_RETRIES) {
      setError('Authentication failed after multiple attempts. Please log in again.');
      return;
    }
    refreshRetryCount.current += 1;

    try {
      const refreshResult = await refreshSession();
      if (refreshResult && refreshResult.access_token) {
        let newToken = refreshResult.access_token;
        try {
          const sessionResult = await validateSession();
          if (sessionResult && sessionResult.session_id) newToken = sessionResult.session_id;
        } catch {}
        setAuthToken(newToken);
        if (refreshResult.refresh_token) setRefreshTokenValue(refreshResult.refresh_token);
        if (webViewRef.current) {
          setTimeout(() => webViewRef.current?.reload(), 500);
        }
        return;
      }
    } catch {}

    setError('Authentication failed. Your session may have expired. Please log in again.');
  }, []);

  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'GET_TOKEN' && authToken && webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'TOKEN', token: authToken }));
        return;
      }
      if (data.type === 'TOKEN_REFRESH_REQUIRED') {
        await tryRefreshAndReload();
      }
    } catch {}
  }, [authToken, tryRefreshAndReload]);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(async (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    const msg = nativeEvent.description || nativeEvent.message || 'Failed to load page';
    const statusCode = nativeEvent.statusCode;

    if (msg.includes('security check') || msg.includes('401') || msg.includes('Unauthorized') ||
        statusCode === 401 || statusCode === 403) {
      await tryRefreshAndReload();
      return;
    }
    setError(msg);
  }, [tryRefreshAndReload]);

  const handleHttpError = useCallback(async (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      if (nativeEvent.statusCode === 401 || nativeEvent.statusCode === 403) {
        await tryRefreshAndReload();
        return;
      }
      if (nativeEvent.statusCode === 500) {
        setError('Server error. Please try again later.');
      } else {
        setError(`Failed to load page (Status: ${nativeEvent.statusCode}).`);
      }
    }
  }, [tryRefreshAndReload]);

  // Same source config as WebViewScreen
  const webViewSource = useMemo(() => {
    if (!pageUrl || !authToken) return null;
    return {
      uri: pageUrl,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'session_id': authToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'PrecastApp/1.0',
      },
    };
  }, [pageUrl, authToken]);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Bird's Eye View</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <View style={styles.errorButtonContainer}>
              <TouchableOpacity
                onPress={() => {
                  setError(null);
                  setIsLoading(true);
                  refreshRetryCount.current = 0;
                  loadAuthToken().catch(() => {
                    setError('Failed to load authentication token. Please try again.');
                  });
                }}
                style={[styles.retryButton, styles.errorButton]}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await Linking.openURL(pageUrl || API_BASE_URL);
                  } catch {
                    Alert.alert('Error', 'Could not open in browser');
                  }
                }}
                style={[styles.retryButton, styles.errorButton, { backgroundColor: '#34C759', marginLeft: 12 }]}
              >
                <Text style={styles.retryButtonText}>Open in Browser</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isVisible && !pageUrl && !error && (
          <View style={styles.loadingContainer}>
            <Text style={styles.noProjectText}>Please select a project first.</Text>
          </View>
        )}

        {isVisible && pageUrl && !authToken && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        )}

        {isVisible && webViewSource && !error && (
          <>
            <WebView
              ref={webViewRef}
              source={webViewSource}
              style={styles.webview}
              injectedJavaScript={injectedJavaScript}
              injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
              onMessage={handleMessage}
              onLoadEnd={handleLoadEnd}
              onError={handleError}
              onHttpError={handleHttpError}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={['*']}
              allowFileAccess={true}
              allowFileAccessFromFileURLs={true}
              allowUniversalAccessFromFileURLs={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              scalesPageToFit={true}
              startInLoadingState={false}
              mixedContentMode="always"
              cacheEnabled={true}
              userAgent={
                Platform.OS === 'android'
                  ? 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
                  : undefined
              }
            />
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading Bird's Eye View…</Text>
              </View>
            )}
          </>
        )}

      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: Colors.textPrimary,
    fontWeight: FontWeights.bold,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  noProjectText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 1,
    backgroundColor: Colors.background,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  errorText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  errorButton: {
    flex: 1,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
});

export default BirdsEyeViewModal;
