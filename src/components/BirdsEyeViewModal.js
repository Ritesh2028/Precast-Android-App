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
} from 'react-native';
import Constants from 'expo-constants';

// Try to load WebView - check multiple ways
let WebView = null;
let WebViewAvailable = false;

// Method 1: Try direct import (most common)
try {
  const WebViewModule = require('react-native-webview');
  if (WebViewModule) {
    // Try WebView property first
    if (WebViewModule.WebView) {
      WebView = WebViewModule.WebView;
      WebViewAvailable = true;
      console.log('✅ WebView loaded successfully');
    } 
    // Try default export
    else if (WebViewModule.default) {
      WebView = WebViewModule.default;
      WebViewAvailable = true;
      console.log('✅ WebView loaded successfully (default export)');
    }
    // Try the module itself
    else if (typeof WebViewModule === 'function') {
      WebView = WebViewModule;
      WebViewAvailable = true;
      console.log('✅ WebView loaded successfully (direct)');
    }
  }
} catch (e) {
  console.warn('⚠️ WebView require failed:', e.message);
}

// Check if running in Expo Go (doesn't support react-native-webview properly)
const isExpoGo = Constants.executionEnvironment === 'storeClient';
if (isExpoGo && WebViewAvailable) {
  console.log('⚠️ Running in Expo Go - WebView may not work properly');
}
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { getTokens } from '../services/tokenManager';
import { validateSession } from '../services/authService';

const BirdsEyeViewModal = ({ visible, onClose, projectId }) => {
  // Ensure visible is always boolean to prevent type casting errors
  const isVisible = !!visible;
  const [error, setError] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const webViewRef = useRef(null);

  // Construct URL with project ID and token - use useMemo to ensure consistent reference
  const url = useMemo(() => {
    const baseUrl = 'https://precast.blueinvent.com/project';
    let finalUrl = projectId 
      ? `${baseUrl}/${projectId}/plan`
      : `${baseUrl}/978617912/plan`; // Fallback to default project
    
    // Add token as URL parameter if available (some pages check this)
    if (authToken) {
      const separator = finalUrl.indexOf('?') === -1 ? '?' : '&';
      finalUrl = `${finalUrl}${separator}token=${encodeURIComponent(authToken)}&auth_token=${encodeURIComponent(authToken)}`;
    }
    
    return finalUrl;
  }, [projectId, authToken]);

  // Load token when modal opens - use useCallback to ensure consistent reference
  const loadAuthToken = useCallback(async () => {
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        throw new Error('No authentication token found');
      }
      
      // Validate session to get session_id (similar to other screens)
      let tokenToUse = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          tokenToUse = sessionResult.session_id;
          console.log('✅ [BirdsEyeViewModal] Using validated session_id');
        } else {
          console.log('⚠️ [BirdsEyeViewModal] Session validation returned no session_id, using access_token');
        }
      } catch (validateError) {
        console.log('⚠️ [BirdsEyeViewModal] Session validation failed, using access_token:', validateError);
      }
      
      setAuthToken(tokenToUse);
      return tokenToUse;
    } catch (error) {
      console.log('❌ [BirdsEyeViewModal] Error loading token:', error);
      throw error;
    }
  }, []);

  // Load token when modal opens
  useEffect(() => {
    if (isVisible) {
      setError(null);
      // Load token first before showing WebView
      loadAuthToken().catch((err) => {
        setError('Failed to load authentication token. Please try again.');
      });
    } else {
      // Reset state when modal closes
      setError(null);
      setAuthToken(null);
    }
  }, [isVisible, loadAuthToken]);

  // JavaScript to inject token into the page - inject immediately on page load
  const injectedJavaScript = useMemo(() => {
    if (!authToken) return '';
    
    // Escape token for use in JavaScript string
    const escapedToken = authToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    
    return `
      (function() {
        try {
          const token = '${escapedToken}';
          if (token && token.length > 0) {
            // Set cookies FIRST before anything else loads
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; domain=.blueinvent.com; SameSite=None; Secure';
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; domain=blueinvent.com; SameSite=None; Secure';
            document.cookie = 'auth_token=' + encodeURIComponent(token) + '; path=/; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; domain=.blueinvent.com; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; domain=blueinvent.com; SameSite=None; Secure';
            document.cookie = 'session_id=' + encodeURIComponent(token) + '; path=/; SameSite=None; Secure';
            
            // Store in storage
            try {
              localStorage.setItem('auth_token', token);
              localStorage.setItem('token', token);
              localStorage.setItem('session_id', token);
              sessionStorage.setItem('auth_token', token);
              sessionStorage.setItem('token', token);
            } catch(e) {
              // Storage error handled silently
            }
            
            // Override fetch BEFORE page scripts run
            if (window.fetch) {
              const originalFetch = window.fetch;
              window.fetch = function(...args) {
                const [url, options = {}] = args;
                const headers = new Headers(options.headers || {});
                if (!headers.has('Authorization')) {
                  headers.set('Authorization', token);
                }
                if (!headers.has('session_id')) {
                  headers.set('session_id', token);
                }
                options.credentials = options.credentials || 'include';
                return originalFetch(url, { ...options, headers });
              };
            }
            
            // Override XMLHttpRequest BEFORE page scripts run
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
                      this.setRequestHeader('Authorization', this._authToken);
                    }
                    if (!this.getRequestHeader('session_id')) {
                      this.setRequestHeader('session_id', this._authToken);
                    }
                  } catch(e) {
                    // Header might already be set
                  }
                }
                return originalSend.apply(this, args);
              };
            }
            
            // Make token available globally
            window.authToken = token;
            window.sessionToken = token;
          }
        } catch(e) {
          console.error('Auth injection error:', e);
        }
        true;
      })();
    `;
  }, [authToken]);

  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'GET_TOKEN' && authToken && webViewRef.current) {
        // Send token to WebView
        webViewRef.current.postMessage(JSON.stringify({
          type: 'TOKEN',
          token: authToken
        }));
      }
    } catch (error) {
      // Error handling WebView message
    }
  }, [authToken]);

  const handleError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    let errorMessage = nativeEvent.description || nativeEvent.message || 'Failed to load page';
    
    // Check for specific security check error
    if (errorMessage.includes('security check') || errorMessage.includes('Failed to initialize')) {
      errorMessage = 'Authentication failed. The security check could not be completed. Please ensure you are logged in and try again.';
    }
    
    setError(errorMessage);
  }, []);

  const handleHttpError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      let errorMsg = `Failed to load page (Status: ${nativeEvent.statusCode}).`;
      if (nativeEvent.statusCode === 401 || nativeEvent.statusCode === 403) {
        errorMsg = 'Authentication failed. Your session may have expired. Please login again.';
      } else if (nativeEvent.statusCode === 500) {
        errorMsg = 'Server error. Please try again later.';
      }
      setError(errorMsg);
    }
  }, []);

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
                  loadAuthToken().catch((err) => {
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
                    const baseUrl = 'https://precast.blueinvent.com/project';
                    const finalUrl = projectId 
                      ? `${baseUrl}/${projectId}/plan`
                      : `${baseUrl}/978617912/plan`;
                    await Linking.openURL(finalUrl);
                  } catch (err) {
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

        {isVisible && authToken && (
          WebViewAvailable && WebView ? (
            <WebView
              ref={webViewRef}
              source={{
                uri: url,
                headers: {
                  'Authorization': authToken,
                  'session_id': authToken,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                  'User-Agent': 'PrecastApp/1.0',
                },
              }}
              style={styles.webview}
              injectedJavaScript={injectedJavaScript}
              injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
              onMessage={handleMessage}
              onError={handleError}
              onHttpError={handleHttpError}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              originWhitelist={['*']}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              scalesPageToFit={true}
              startInLoadingState={false}
            />
          ) : (
            <View style={styles.fallbackContainer}>
              <Text style={styles.fallbackTitle}>Bird's Eye View</Text>
              <Text style={styles.fallbackMessage}>
                {isExpoGo 
                  ? 'WebView is not available in Expo Go.\nPlease use development build or open in browser.'
                  : 'WebView component is not available.\nPlease install react-native-webview or open in browser.'}
              </Text>
              <TouchableOpacity
                style={styles.fallbackButton}
                onPress={async () => {
                  try {
                    const finalUrl = url || (projectId 
                      ? `https://precast.blueinvent.com/project/${projectId}/plan`
                      : 'https://precast.blueinvent.com/project/978617912/plan');
                    const supported = await Linking.canOpenURL(finalUrl);
                    if (supported) {
                      await Linking.openURL(finalUrl);
                      setTimeout(() => {
                        onClose();
                      }, 500);
                    } else {
                      Alert.alert('Error', `Cannot open URL: ${finalUrl}`);
                    }
                  } catch (error) {
                    console.log('Error opening URL:', error);
                    Alert.alert('Error', 'Failed to open the plan view');
                  }
                }}
              >
                <Text style={styles.fallbackButtonText}>Open in Browser</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fallbackButton, styles.fallbackButtonSecondary]}
                onPress={onClose}
              >
                <Text style={styles.fallbackButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          )
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.background,
  },
  fallbackTitle: {
    fontSize: FontSizes.xlarge,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  fallbackMessage: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  fallbackButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    minWidth: 200,
  },
  fallbackButtonSecondary: {
    backgroundColor: '#8E8E93',
  },
  fallbackButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
});

export default BirdsEyeViewModal;
