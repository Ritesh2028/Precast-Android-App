import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  StatusBar,
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
  PanResponder,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBackHandler } from '../hooks/useBackHandler';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { OfflineScreen } from '../components/OfflineScreen';
import { ErrorScreen } from '../components/ErrorScreen';
import CameraQRScanner from '../components/CameraQRScanner';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { getTokens } from '../services/tokenManager';
import { validateSession, refreshSession, logout } from '../services/authService';

const WEB_URL = 'https://precast.blueinvent.com/';
const RETRY_DELAY = 2000;

/**
 * Safely converts any value to a boolean
 */
const toBoolean = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0 && !isNaN(value);
  }
  if (typeof value === 'string') {
    const normalized = String(value).toLowerCase().trim();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'granted';
  }
  return Boolean(value);
};

/**
 * Safely parses JSON string with error handling
 */
const safeJsonParse = (jsonString, fallback = null) => {
  try {
    if (typeof jsonString !== 'string') {
      return fallback;
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON parse error:', error);
    return fallback;
  }
};

/**
 * Validate token locally
 */
const validateToken = (token) => {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp > currentTime;
  } catch (error) {
    return false;
  }
};

const WebViewScreen = ({ navigation, route }) => {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState(undefined);
  const [currentUrl, setCurrentUrl] = useState(WEB_URL);
  const [authToken, setAuthToken] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false); // Flag to prevent auto re-login
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Track if WebView has loaded at least once
  const { isConnected } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const safeAreaInsets = useRef({ top: 0, bottom: 0, left: 0, right: 0 });
  
  // Get URL from route params or use default
  const webUrl = route?.params?.url || WEB_URL;
  
  // Log route params for debugging
  useEffect(() => {
    console.log('📱 [WebViewScreen] Component mounted');
    console.log('📱 [WebViewScreen] Route params:', JSON.stringify(route?.params, null, 2));
    console.log('📱 [WebViewScreen] Web URL:', webUrl);
  }, [route?.params, webUrl]);

  // Update safe area insets
  useEffect(() => {
    safeAreaInsets.current = insets;
  }, [insets]);

  // Reset state when component mounts or comes into focus (new login)
  useFocusEffect(
    useCallback(() => {
      // Reset all state when screen comes into focus (new login or navigation)
      console.log('🔄 [WebViewScreen] Screen focused, resetting state');
      setIsLoggingOut(false);
      setHasError(false);
      setErrorMessage(undefined);
      setHasLoadedOnce(false); // Reset loaded flag on new login
      // Don't reset authToken here, let the token loading effect handle it
    }, [])
  );

  // Load and validate auth token with refresh if needed
  useEffect(() => {
    const loadAndValidateToken = async () => {
      try {
        // Don't load if we're logging out
        if (isLoggingOut) {
          console.log('⚠️ [WebViewScreen] Logout in progress, skipping token load');
          return;
        }
        
        setIsLoading(true);
        
        // Get tokens from secure storage
        const { accessToken, refreshToken } = await getTokens();
        
        if (!accessToken && !refreshToken) {
          // No tokens at all, redirect to login
          Alert.alert(
            'Session Expired',
            'Your session has expired. Please login again.',
            [
              {
                text: 'OK',
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                  });
                },
              },
            ]
          );
          return;
        }

        // Check if access token is valid
        const isTokenValid = validateToken(accessToken);
        
        if (!isTokenValid) {
          // Token expired, try to refresh
          console.log('Access token expired, attempting refresh...');
          
          if (!refreshToken) {
            Alert.alert(
              'Session Expired',
              'Your session has expired. Please login again.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    });
                  },
                },
              ]
            );
            return;
          }

          // Refresh the token
          const refreshResult = await refreshSession();
          
          if (refreshResult && refreshResult.access_token) {
            // Validate session to get session_id
            let newToken = refreshResult.access_token;
            try {
              const sessionResult = await validateSession();
              if (sessionResult && sessionResult.session_id) {
                newToken = sessionResult.session_id;
              }
            } catch (validateError) {
              console.log('Session validation failed, using access_token');
            }
            
            setAuthToken(newToken);
            console.log('Token refreshed successfully');
          } else {
            // Refresh failed, redirect to login
            Alert.alert(
              'Session Expired',
              'Your session has expired. Please login again.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    });
                  },
                },
              ]
            );
            return;
          }
        } else {
          // Token is valid, validate session to get session_id
          let tokenToUse = accessToken;
          try {
            const sessionResult = await validateSession();
            if (sessionResult && sessionResult.session_id) {
              tokenToUse = sessionResult.session_id;
            }
          } catch (validateError) {
            console.log('Session validation failed, using access_token');
          }
          setAuthToken(tokenToUse);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load/validate token:', error);
        setIsLoading(false);
        setHasError(true);
        setErrorMessage('Failed to authenticate. Please try again.');
      }
    };
    
    // Only load if not logging out
    if (!isLoggingOut) {
      loadAndValidateToken();
    }
  }, [navigation, isLoggingOut]);

  // Periodic token validation and refresh (every 5 minutes)
  useEffect(() => {
    if (!authToken || isLoggingOut) return; // Don't validate if logging out

    const validateAndRefreshToken = async () => {
      if (isLoggingOut) return; // Double check
      try {
        const { accessToken } = await getTokens();
        
        if (!accessToken) return;

        // Check if token is valid
        const isTokenValid = validateToken(accessToken);
        
        if (!isTokenValid) {
          // Token expired, refresh it
          console.log('Token expired during session, refreshing...');
          const refreshResult = await refreshSession();
          
          if (refreshResult && refreshResult.access_token) {
            let newToken = refreshResult.access_token;
            try {
              const sessionResult = await validateSession();
              if (sessionResult && sessionResult.session_id) {
                newToken = sessionResult.session_id;
              }
            } catch (validateError) {
              console.log('Session validation failed');
            }
            
            setAuthToken(newToken);
            
            // Reload WebView with new token
            if (webViewRef.current) {
              webViewRef.current.reload();
            }
          } else {
            // Refresh failed, redirect to login
            Alert.alert(
              'Session Expired',
              'Your session has expired. Please login again.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    });
                  },
                },
              ]
            );
          }
        } else {
          // Token is valid, but check if it's about to expire (within 2 minutes)
          try {
            const tokenParts = accessToken.split('.');
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              const currentTime = Math.floor(Date.now() / 1000);
              const timeUntilExpiry = payload.exp - currentTime;
              
              // If token expires within 2 minutes (120 seconds), refresh proactively
              if (timeUntilExpiry < 120 && timeUntilExpiry > 0) {
                console.log('Token expiring soon, refreshing proactively...');
                const refreshResult = await refreshSession();
                if (refreshResult && refreshResult.access_token) {
                  let newToken = refreshResult.access_token;
                  try {
                    const sessionResult = await validateSession();
                    if (sessionResult && sessionResult.session_id) {
                      newToken = sessionResult.session_id;
                    }
                  } catch (validateError) {
                    console.log('Session validation failed');
                  }
                  setAuthToken(newToken);
                }
              } else {
                // Validate session to get updated session_id if needed
                try {
                  const validationResult = await validateSession();
                  if (validationResult?.session_id) {
                    const newSessionId = validationResult.session_id;
                    if (newSessionId !== authToken) {
                      setAuthToken(newSessionId);
                    }
                  }
                } catch (validationError) {
                  console.error('Session validation error:', validationError);
                }
              }
            }
          } catch (parseError) {
            console.error('Error parsing token:', parseError);
          }
        }
      } catch (error) {
        console.error('Token validation/refresh error:', error);
      }
    };

    // Validate immediately
    validateAndRefreshToken();

    // Then validate every 5 minutes (300000 ms)
    const interval = setInterval(validateAndRefreshToken, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [authToken, navigation]);

  const handleBackPress = useCallback(() => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack]);

  useBackHandler({
    canGoBack,
    onBackPress: handleBackPress,
  });

  const handleNavigationStateChange = useCallback(async (navState) => {
    setCanGoBack(toBoolean(navState.canGoBack));
    setIsLoading(toBoolean(navState.loading));
    setHasError(false);
    
    if (navState.url) {
      const previousUrl = currentUrl;
      setCurrentUrl(navState.url);
      
      // Mark that WebView has loaded at least once
      if (!hasLoadedOnce && !navState.loading) {
        setHasLoadedOnce(true);
        console.log('✅ [WebViewScreen] Initial load completed');
      }
      
      // Only check for logout URLs after initial load and if we have an auth token
      // Don't trigger on initial load or if we're already logging out
      if (hasLoadedOnce && authToken && !isLoggingOut && !navState.loading) {
        const urlLower = navState.url.toLowerCase();
        
        // Check if URL indicates logout (login page or logout endpoint)
        // Exclude the base URL and only check for actual login/logout paths
        const isLogoutUrl = (
          (urlLower.includes('/login') && !urlLower.includes('/login?') && !urlLower.includes('/login#')) ||
          urlLower.includes('/logout') ||
          urlLower.includes('logout=true') ||
          (urlLower.includes('/auth/login') && !urlLower.includes('token='))
        );
        
        // Only trigger logout if we navigated TO a login page from an authenticated page
        // Not if we're on the base URL or initial load
        if (isLogoutUrl && previousUrl && !previousUrl.toLowerCase().includes('/login')) {
          console.log('🔄 [WebViewScreen] Detected logout URL, clearing session');
          console.log('🔄 [WebViewScreen] Previous URL:', previousUrl);
          console.log('🔄 [WebViewScreen] Current URL:', navState.url);
          setIsLoggingOut(true);
          try {
            if (webViewRef.current) {
              webViewRef.current.stopLoading();
            }
            await clearWebViewData();
            await logout();
            setAuthToken(null);
            // Small delay to ensure cleanup completes
            setTimeout(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }, 500);
          } catch (error) {
            console.error('Error handling logout from URL:', error);
            setIsLoggingOut(false);
          }
        }
      }
    }
  }, [authToken, clearWebViewData, logout, navigation, currentUrl, hasLoadedOnce, isLoggingOut]);

  const handleError = useCallback(async (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    const errorDesc = nativeEvent.description || nativeEvent.message || 'Failed to load page';
    const statusCode = nativeEvent.statusCode;
    
    // Check if error is related to security/authentication
    if (errorDesc.includes('security check') || errorDesc.includes('Failed to initialize') || 
        errorDesc.includes('401') || errorDesc.includes('Unauthorized') ||
        statusCode === 401 || statusCode === 403) {
      
      // Try to refresh token and reload
      try {
        console.log('Security check failed or 401/403 error, attempting token refresh...');
        const refreshResult = await refreshSession();
        
        if (refreshResult && refreshResult.access_token) {
          let newToken = refreshResult.access_token;
          try {
            const sessionResult = await validateSession();
            if (sessionResult && sessionResult.session_id) {
              newToken = sessionResult.session_id;
            }
          } catch (validateError) {
            console.log('Session validation failed');
          }
          
          setAuthToken(newToken);
          
          // Reload WebView with new token
          if (webViewRef.current) {
            setTimeout(() => {
              webViewRef.current?.reload();
            }, 500);
          }
          return;
        }
      } catch (refreshError) {
        console.error('Token refresh failed on error:', refreshError);
      }
    }
    
    setHasError(true);
    setErrorMessage(errorDesc);
    setIsLoading(false);
  }, []);

  const handleHttpError = useCallback(async (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    setIsLoading(false);
    
    if (nativeEvent.statusCode >= 400) {
      // If 401 or 403, try to refresh token
      if (nativeEvent.statusCode === 401 || nativeEvent.statusCode === 403) {
        try {
          console.log('HTTP 401/403 error, attempting token refresh...');
          const refreshResult = await refreshSession();
          
          if (refreshResult && refreshResult.access_token) {
            let newToken = refreshResult.access_token;
            try {
              const sessionResult = await validateSession();
              if (sessionResult && sessionResult.session_id) {
                newToken = sessionResult.session_id;
              }
            } catch (validateError) {
              console.log('Session validation failed');
            }
            
            setAuthToken(newToken);
            
            // Reload WebView with new token
            if (webViewRef.current) {
              setTimeout(() => {
                webViewRef.current?.reload();
              }, 500);
            }
            return;
          }
        } catch (refreshError) {
          console.error('Token refresh failed on HTTP error:', refreshError);
        }
        
        setHasError(true);
        setErrorMessage('Authentication failed. Your session may have expired. Please login again.');
      } else if (nativeEvent.statusCode === 500) {
        setHasError(true);
        setErrorMessage('Server error. Please try again later.');
      } else {
        setHasError(true);
        setErrorMessage(`Failed to load page (Status: ${nativeEvent.statusCode}).`);
      }
    }
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleReload = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const handleRetry = useCallback(() => {
    if (isConnected) {
      handleReload();
    }
  }, [isConnected, handleReload]);

  // Two-finger scroll down gesture for refresh
  const twoFingerScrollRef = useRef({
    touches: 0,
    startY: 0,
    currentY: 0,
    scrollDistance: 0,
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          const touchCount = evt.nativeEvent.touches.length;
          if (touchCount === 2) {
            const firstTouch = evt.nativeEvent.touches[0];
            twoFingerScrollRef.current = {
              touches: 2,
              startY: firstTouch.pageY,
              currentY: firstTouch.pageY,
              scrollDistance: 0,
            };
            return true;
          }
          return false;
        },
        onMoveShouldSetPanResponder: () => {
          return twoFingerScrollRef.current.touches === 2;
        },
        onPanResponderMove: (evt) => {
          if (evt.nativeEvent.touches.length === 2) {
            const firstTouch = evt.nativeEvent.touches[0];
            const currentY = firstTouch.pageY;
            const startY = twoFingerScrollRef.current.startY;
            
            const scrollDistance = currentY - startY;
            twoFingerScrollRef.current.currentY = currentY;
            twoFingerScrollRef.current.scrollDistance = scrollDistance;

            if (scrollDistance > 100) {
              console.log('🔄 Two-finger scroll down detected - Refreshing page');
              handleReload();
              twoFingerScrollRef.current = {
                touches: 0,
                startY: 0,
                currentY: 0,
                scrollDistance: 0,
              };
            }
          }
        },
        onPanResponderRelease: () => {
          twoFingerScrollRef.current = {
            touches: 0,
            startY: 0,
            currentY: 0,
            scrollDistance: 0,
          };
        },
      }),
    [handleReload]
  );

  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  
  // QR Button position and animation
  const qrButtonSize = 56;
  const screenDimensions = useRef(Dimensions.get('window'));
  
  const qrButtonX = useRef(new Animated.Value(100)).current;
  const qrButtonY = useRef(new Animated.Value(10)).current;
  const qrButtonScale = useRef(new Animated.Value(1)).current;
  const qrButtonOpacity = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    const { width } = screenDimensions.current;
    const initialX = Math.max(insets.left, Math.min(width - 56 - insets.right, width - 80));
    const initialY = Math.max(insets.top + 20, 20);
    qrButtonX.setValue(initialX);
    qrButtonY.setValue(initialY);
  }, [insets, qrButtonX, qrButtonY]);
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      screenDimensions.current = window;
      const currentX = qrButtonX._value;
      const currentY = qrButtonY._value;
      const { width, height } = window;
      const boundedX = Math.max(0, Math.min(width - qrButtonSize, currentX));
      const boundedY = Math.max(0, Math.min(height - qrButtonSize, currentY));
      Animated.parallel([
        Animated.spring(qrButtonX, {
          toValue: boundedX,
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }),
        Animated.spring(qrButtonY, {
          toValue: boundedY,
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }),
      ]).start();
    });
    return () => subscription?.remove();
  }, [qrButtonX, qrButtonY]);

  const requestCameraPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'App needs camera access to scan QR codes',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        const isGranted = toBoolean(granted === PermissionsAndroid.RESULTS.GRANTED || granted === 'granted');
        setCameraPermissionGranted(isGranted);
        if (!isGranted) {
          Alert.alert(
            'Camera Permission Required',
            'Camera permission is required to scan QR codes. Please grant permission in app settings.'
          );
        }
        return isGranted;
      } catch (err) {
        console.error('Camera permission error:', err);
        setCameraPermissionGranted(false);
        return false;
      }
    }
    setCameraPermissionGranted(true);
    return true;
  }, []);

  const handleQRButtonPress = useCallback(async () => {
    const granted = await requestCameraPermission();
    if (!granted) {
      Alert.alert(
        'Camera Permission Required',
        'Camera permission is required to scan QR codes. Please grant permission in app settings.'
      );
      return;
    }
    setQrScannerVisible(true);
  }, [requestCameraPermission]);

  const qrButtonDragRef = useRef({
    isDragging: false,
    initialX: 0,
    initialY: 0,
    dragThreshold: 8,
  });
  
  const qrButtonPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > qrButtonDragRef.current.dragThreshold || 
                 Math.abs(gestureState.dy) > qrButtonDragRef.current.dragThreshold;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: () => {
          qrButtonDragRef.current.isDragging = false;
          qrButtonDragRef.current.initialX = qrButtonX._value;
          qrButtonDragRef.current.initialY = qrButtonY._value;
          
          Animated.parallel([
            Animated.spring(qrButtonScale, {
              toValue: 0.9,
              useNativeDriver: false,
              tension: 300,
              friction: 20,
            }),
            Animated.timing(qrButtonOpacity, {
              toValue: 0.8,
              duration: 100,
              useNativeDriver: false,
            }),
          ]).start();
        },
        onPanResponderMove: (evt, gestureState) => {
          const { dx, dy } = gestureState;
          
          if (!qrButtonDragRef.current.isDragging) {
            if (Math.abs(dx) > qrButtonDragRef.current.dragThreshold || 
                Math.abs(dy) > qrButtonDragRef.current.dragThreshold) {
              qrButtonDragRef.current.isDragging = true;
              if (webViewRef.current) {
                webViewRef.current.stopLoading();
              }
            }
          }
          
          if (qrButtonDragRef.current.isDragging) {
            const { width: screenWidth, height: screenHeight } = screenDimensions.current;
            const { top, bottom, left, right } = safeAreaInsets.current;
            
            const newX = qrButtonDragRef.current.initialX + dx;
            const newY = qrButtonDragRef.current.initialY + dy;
            
            const minX = left;
            const maxX = screenWidth - qrButtonSize - right;
            const minY = top;
            const maxY = screenHeight - qrButtonSize - bottom;
            
            const boundedX = Math.max(minX, Math.min(maxX, newX));
            const boundedY = Math.max(minY, Math.min(maxY, newY));
            
            qrButtonX.setValue(boundedX);
            qrButtonY.setValue(boundedY);
          }
        },
        onPanResponderRelease: () => {
          Animated.parallel([
            Animated.spring(qrButtonScale, {
              toValue: 1,
              useNativeDriver: false,
              tension: 300,
              friction: 20,
            }),
            Animated.timing(qrButtonOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            }),
          ]).start();
          
          if (qrButtonDragRef.current.isDragging) {
            const { width: screenWidth, height: screenHeight } = screenDimensions.current;
            const { top, bottom, left, right } = safeAreaInsets.current;
            
            const currentX = qrButtonX._value;
            const currentY = qrButtonY._value;
            
            const minX = left;
            const maxX = screenWidth - qrButtonSize - right;
            const minY = top;
            const maxY = screenHeight - qrButtonSize - bottom;
            
            const boundedX = Math.max(minX, Math.min(maxX, currentX));
            const boundedY = Math.max(minY, Math.min(maxY, currentY));
            
            Animated.parallel([
              Animated.spring(qrButtonX, {
                toValue: boundedX,
                useNativeDriver: false,
                tension: 50,
                friction: 7,
              }),
              Animated.spring(qrButtonY, {
                toValue: boundedY,
                useNativeDriver: false,
                tension: 50,
                friction: 7,
              }),
            ]).start();
            
            qrButtonDragRef.current.isDragging = false;
            return;
          }
          
          handleQRButtonPress();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(qrButtonScale, {
              toValue: 1,
              useNativeDriver: false,
              tension: 300,
              friction: 20,
            }),
            Animated.timing(qrButtonOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            }),
          ]).start();
          qrButtonDragRef.current.isDragging = false;
        },
      }),
    [qrButtonX, qrButtonY, qrButtonScale, qrButtonOpacity, handleQRButtonPress]
  );

  const handleQRScan = useCallback((data) => {
    const script = `
      (function() {
        var inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
        for (var i = 0; i < inputs.length; i++) {
          var input = inputs[i];
          var placeholder = (input.placeholder || '').toLowerCase();
          var name = (input.name || '').toLowerCase();
          var id = (input.id || '').toLowerCase();
          var className = (input.className || '').toLowerCase();
          
          if (placeholder.includes('qr') || placeholder.includes('scan') ||
              name.includes('qr') || name.includes('scan') ||
              id.includes('qr') || id.includes('scan') ||
              className.includes('qr') || className.includes('scan')) {
            input.value = '${data.replace(/'/g, "\\'")}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
        
        var event = new CustomEvent('qrScanned', { detail: { data: '${data.replace(/'/g, "\\'")}' } });
        window.dispatchEvent(event);
      })();
      true;
    `;
    
    webViewRef.current?.injectJavaScript(script);
    setQrScannerVisible(false);
  }, []);

  const downloadFile = useCallback(
    async (url, fileName) => {
      if (Platform.OS !== 'android') {
        console.warn('Downloads only supported on Android');
        return;
      }

      try {
        let absoluteUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:')) {
          absoluteUrl = new URL(url, WEB_URL).href;
        }

        const finalFileName = fileName || absoluteUrl.split('/').pop()?.split('?')[0] || `report_${Date.now()}.pdf`;
        
        try {
          await Linking.openURL(absoluteUrl);
          Alert.alert(
            'Download Started', 
            `Downloading ${finalFileName}...\n\nCheck your Downloads folder and notifications.`,
            [{text: 'OK'}]
          );
        } catch (linkError) {
          throw new Error('Failed to start download. Please check your internet connection.');
        }
      } catch (error) {
        Alert.alert('Download Failed', error.message || 'Failed to start download. Please try again.');
      }
    },
    []
  );

  const handleFileDownload = useCallback(
    ({ nativeEvent }) => {
      const { downloadUrl } = nativeEvent;
      if (Platform.OS === 'android') {
        downloadFile(downloadUrl);
        return false;
      }
      return true;
    },
    [downloadFile]
  );

  const handleMessage = useCallback(
    async (event) => {
      try {
        const data = safeJsonParse(event.nativeEvent.data);
        if (!data) {
          return;
        }
        
        if (data.type === 'DOWNLOAD_FILE') {
          const { url, fileName } = data;
          downloadFile(url, fileName);
        } else if (data.type === 'REQUEST_CAMERA_PERMISSION') {
          requestCameraPermission().then((granted) => {
            if (webViewRef.current) {
              webViewRef.current.postMessage(
                JSON.stringify({
                  type: 'CAMERA_PERMISSION_GRANTED',
                  granted: toBoolean(granted),
                })
              );
            }
          });
        } else if (data.type === 'LOGOUT_REQUESTED') {
          // WebView requested logout
          console.log('🔄 [WebViewScreen] Logout requested from WebView');
          setIsLoggingOut(true);
          if (webViewRef.current) {
            webViewRef.current.stopLoading();
          }
          await clearWebViewData();
          await logout();
          setAuthToken(null);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } else if (data.type === 'TOKEN_REFRESH_REQUIRED') {
          // WebView detected security check error, refresh token
          console.log('WebView requested token refresh due to security check error');
          try {
            const refreshResult = await refreshSession();
            if (refreshResult && refreshResult.access_token) {
              let newToken = refreshResult.access_token;
              try {
                const sessionResult = await validateSession();
                if (sessionResult && sessionResult.session_id) {
                  newToken = sessionResult.session_id;
                }
              } catch (validateError) {
                console.log('Session validation failed');
              }
              
              setAuthToken(newToken);
              
              // Reload WebView with new token
              if (webViewRef.current) {
                setTimeout(() => {
                  webViewRef.current?.reload();
                }, 500);
              }
            }
          } catch (refreshError) {
            console.error('Token refresh failed from WebView message:', refreshError);
          }
        }
      } catch (error) {
        console.warn('handleMessage error:', error);
      }
    },
    [downloadFile, requestCameraPermission, clearWebViewData, logout, navigation]
  );

  const handleShouldStartLoadWithRequest = useCallback(
    (request) => {
      const { url } = request;
      
      if (!url || url === WEB_URL || url.startsWith(WEB_URL)) {
        return true;
      }
      
      const downloadExtensions = [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.rar', '.7z', '.tar', '.gz',
        '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.mkv',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
        '.apk', '.ipa',
        '.txt', '.csv', '.json', '.xml', '.rtf'
      ];
      
      const lowerUrl = url.toLowerCase();
      const urlPath = lowerUrl.split('?')[0].split('#')[0];
      const isDirectFileDownload = downloadExtensions.some(ext => 
        urlPath.endsWith(ext.toLowerCase())
      );
      
      const hasDownloadPattern = lowerUrl.includes('download=true') || 
                                 lowerUrl.includes('attachment=true') ||
                                 lowerUrl.includes('content-disposition=attachment') ||
                                 lowerUrl.includes('force-download=true') ||
                                 lowerUrl.includes('download=1') ||
                                 lowerUrl.includes('attachment') ||
                                 request.headers?.['Content-Disposition']?.includes('attachment');
      
      if (isDirectFileDownload || hasDownloadPattern) {
        const fileName = url.split('/').pop()?.split('?')[0] || `download_${Date.now()}`;
        downloadFile(url, fileName).catch(err => {
          console.error('Download failed:', err);
        });
        return false;
      }
      
      return true;
    },
    [downloadFile]
  );

  // Auto-retry when network returns
  useEffect(() => {
    if (isConnected && hasError) {
      const timer = setTimeout(() => {
        handleReload();
      }, RETRY_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isConnected, hasError, handleReload]);

  // Token injection JavaScript
  const injectedJavaScript = useMemo(() => {
    // Don't inject anything if we're logging out
    if (isLoggingOut) {
      return `
        (function() {
          // Prevent any token injection during logout
          console.log('Logout in progress, skipping token injection');
          true;
        })();
      `;
    }
    
    // Don't inject tokens on login/logout pages
    const urlLower = currentUrl.toLowerCase();
    const isLoginPage = urlLower.includes('/login') || urlLower.includes('/logout');
    if (isLoginPage && !urlLower.includes('token=')) {
      return `
        (function() {
          // On login page, clear any existing tokens
          try {
            if (window.authToken) delete window.authToken;
            if (window.sessionToken) delete window.sessionToken;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('token');
            localStorage.removeItem('session_id');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('token');
          } catch(e) {}
          true;
        })();
      `;
    }
    
    if (!authToken) {
      // If no token, clear everything and notify logout
      return `
        (function() {
          try {
            localStorage.clear();
            sessionStorage.clear();
            document.cookie.split(";").forEach(function(c) { 
              document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'LOGOUT_REQUESTED',
                reason: 'no_token'
              }));
            }
          } catch(e) {
            console.error('Error clearing storage:', e);
          }
          true;
        })();
      `;
    }
    
    const escapedToken = authToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    
    return `
      (function() {
        try {
          const token = '${escapedToken}';
          if (token && token.length > 0) {
            // Set cookies
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
            } catch(e) {}
            
            // Override fetch
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
                  // Check for 401/403 errors
                  if (response.status === 401 || response.status === 403) {
                    console.log('Fetch returned 401/403, requesting token refresh');
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
            
            // Override XMLHttpRequest
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
                
                // Monitor for 401/403 responses
                var originalOnReadyStateChange = this.onreadystatechange;
                this.onreadystatechange = function() {
                  if (this.readyState === 4 && (this.status === 401 || this.status === 403)) {
                    console.log('XHR returned 401/403, requesting token refresh');
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
  }, [authToken, isLoggingOut, currentUrl]);

  // Full injected JavaScript with download handling
  const fullInjectedJavaScript = useMemo(() => {
    const baseScript = injectedJavaScript;
    
    return baseScript + `
      (function() {
        // Track if this is the initial page load
        var isInitialLoad = true;
        var previousUrl = window.location.href;
        var hasNavigatedAway = false;
        
        // Mark initial load as complete after a short delay
        setTimeout(function() {
          isInitialLoad = false;
          previousUrl = window.location.href;
          console.log('Initial load completed, logout detection enabled');
        }, 3000); // 3 second delay to allow initial page to load
        
        // Detect security check errors and logout scenarios
        function checkForSecurityErrors() {
          // Don't check on initial load
          if (isInitialLoad) {
            return;
          }
          
          var bodyText = document.body ? document.body.innerText || document.body.textContent || '' : '';
          var htmlContent = document.documentElement ? document.documentElement.innerHTML || '' : '';
          var allText = (bodyText + ' ' + htmlContent).toLowerCase();
          var currentUrl = window.location.href.toLowerCase();
          
          // Only check for logout if we've navigated away from the initial page
          if (currentUrl !== previousUrl.toLowerCase()) {
            hasNavigatedAway = true;
          }
          
          // Check for logout indicators - only if we've navigated away from initial page
          if (hasNavigatedAway && (
              (currentUrl.includes('/login') && !currentUrl.includes('token=') && !currentUrl.includes('/login?')) || 
              currentUrl.includes('/logout') ||
              currentUrl.includes('logout=true'))) {
            // User navigated to login page - this means logout
            console.log('Logout detected from navigation to login page');
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'LOGOUT_REQUESTED',
                reason: 'login_page_detected'
              }));
            }
            return;
          }
          
          // Check for security/authentication errors (but not on login page or initial load)
          if (!currentUrl.includes('/login') && 
              (allText.includes('failed to initialize') || 
               allText.includes('security check') ||
               allText.includes('unauthorized'))) {
            console.log('Security check error detected, requesting token refresh');
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'TOKEN_REFRESH_REQUIRED',
                reason: 'security_check_error'
              }));
            }
          }
          
          previousUrl = currentUrl;
        }
        
        // Check on page load (but only after initial load delay)
        setTimeout(function() {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkForSecurityErrors);
          } else {
            checkForSecurityErrors();
          }
        }, 3000);
        
        // Also check periodically (but only after initial load)
        setTimeout(function() {
          setInterval(checkForSecurityErrors, 5000);
        }, 3000);
        
        // Prevent zoom on double tap
        var meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.getElementsByTagName('head')[0].appendChild(meta);
        
        // Camera/QR Scanner support
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          var originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = function(constraints) {
            if (constraints && (constraints.video || (constraints.video && constraints.video.facingMode))) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'REQUEST_CAMERA_PERMISSION'
                }));
              }
            }
            return originalGetUserMedia(constraints);
          };
        }
        
        // Download handling
        var downloadExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
          '.zip', '.rar', '.7z', '.tar', '.gz', '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.mkv',
          '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.apk', '.txt', '.csv', '.json', '.xml', '.rtf'];
        
        function isDownloadUrl(url) {
          if (!url) return false;
          var lowerUrl = url.toLowerCase();
          var urlPath = lowerUrl.split('?')[0].split('#')[0];
          return downloadExtensions.some(function(ext) {
            return urlPath.endsWith(ext);
          }) || lowerUrl.includes('download=true') || 
               lowerUrl.includes('attachment=true') ||
               lowerUrl.includes('content-disposition=attachment');
        }
        
        function handleDownload(url, fileName) {
          if (window.ReactNativeWebView) {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'DOWNLOAD_FILE',
                url: url,
                fileName: fileName
              }));
              return true;
            } catch (err) {
              return false;
            }
          }
          return false;
        }
        
        // Intercept clicks
        document.addEventListener('click', function(e) {
          var target = e.target;
          var clickedElement = null;
          
          while (target && target !== document.body) {
            var tagName = target.tagName;
            var text = (target.textContent || target.innerText || '').toLowerCase();
            
            if (tagName === 'A' && target.hasAttribute('href')) {
              clickedElement = target;
              break;
            } else if (tagName === 'BUTTON' || tagName === 'INPUT' || 
                       (tagName === 'DIV' || tagName === 'SPAN') && 
                       (text.includes('download') || text.includes('report'))) {
              clickedElement = target;
              break;
            }
            target = target.parentElement;
          }
          
          if (clickedElement && clickedElement.tagName === 'A') {
            var href = clickedElement.getAttribute('href');
            if (href) {
              try {
                var absoluteUrl = new URL(href, window.location.href).href;
                if (isDownloadUrl(absoluteUrl)) {
                  e.preventDefault();
                  e.stopPropagation();
                  var fileName = absoluteUrl.split('/').pop().split('?')[0] || 'download';
                  handleDownload(absoluteUrl, fileName);
                  return false;
                }
              } catch (err) {
                if (isDownloadUrl(href)) {
                  e.preventDefault();
                  e.stopPropagation();
                  var fileName = href.split('/').pop().split('?')[0] || 'download';
                  handleDownload(href, fileName);
                  return false;
                }
              }
            }
          }
        }, true);
      })();
      true;
    `;
  }, [injectedJavaScript]);

  // Clear WebView cookies and storage
  const clearWebViewData = useCallback(async () => {
    try {
      console.log('🧹 [WebViewScreen] Clearing WebView data...');
      
      if (webViewRef.current) {
        // Clear cache (this also helps clear some cookies)
        try {
          await webViewRef.current.clearCache?.(true);
          console.log('✅ [WebViewScreen] Cache cleared');
        } catch (cacheError) {
          console.warn('⚠️ [WebViewScreen] Cache clear error:', cacheError);
        }
        
        // Inject JavaScript to clear all storage and cookies
        const clearStorageScript = `
          (function() {
            try {
              // Clear localStorage
              localStorage.clear();
              // Clear sessionStorage
              sessionStorage.clear();
              
              // Clear all cookies for the domain
              var cookies = document.cookie.split(";");
              for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i];
                var eqPos = cookie.indexOf("=");
                var name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                if (name) {
                  // Clear for current domain
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                  // Clear for .blueinvent.com
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.blueinvent.com";
                  // Clear for blueinvent.com
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=blueinvent.com";
                }
              }
              
              // Clear indexedDB
              if (window.indexedDB) {
                indexedDB.databases().then(databases => {
                  databases.forEach(db => {
                    indexedDB.deleteDatabase(db.name);
                  });
                });
              }
              
              // Clear service workers
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                  registrations.forEach(registration => {
                    registration.unregister();
                  });
                });
              }
              
              // Clear any auth-related global variables
              if (window.authToken) delete window.authToken;
              if (window.sessionToken) delete window.sessionToken;
              if (window.token) delete window.token;
              
              console.log('✅ Storage and cookies cleared');
            } catch(e) {
              console.error('Error clearing storage:', e);
            }
            true;
          })();
        `;
        webViewRef.current.injectJavaScript(clearStorageScript);
      }
      
      console.log('✅ [WebViewScreen] WebView data cleared');
    } catch (error) {
      console.error('❌ [WebViewScreen] Error clearing WebView data:', error);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔄 [WebViewScreen] Logging out...');
              
              // Set logout flag to prevent auto re-login
              setIsLoggingOut(true);
              
              // Stop any ongoing token refresh
              if (webViewRef.current) {
                webViewRef.current.stopLoading();
              }
              
              // Clear WebView cookies and storage first
              await clearWebViewData();
              
              // Clear auth tokens
              await logout();
              
              // Clear local auth token state
              setAuthToken(null);
              
              console.log('✅ [WebViewScreen] Logout complete, navigating to Login');
              
              // Navigate to Login screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('❌ [WebViewScreen] Logout error:', error);
              setIsLoggingOut(false); // Reset flag on error
              // Still navigate to login even if there's an error
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }
          },
        },
      ]
    );
  }, [navigation, clearWebViewData]);

  if (!isConnected && !hasError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={Colors.background}
        />
        <OfflineScreen onRetry={handleRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={Colors.background}
        translucent={false}
      />
      {hasError ? (
        <ErrorScreen onReload={handleReload} errorMessage={errorMessage} />
      ) : !authToken ? (
        <View style={styles.webViewContainer}>
          <LoadingIndicator />
        </View>
      ) : (
        <View style={styles.webViewContainer} {...panResponder.panHandlers}>
          <WebView
            ref={webViewRef}
            source={{
              uri: webUrl,
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'session_id': authToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'PrecastApp/1.0',
              },
            }}
            style={styles.webView}
            onNavigationStateChange={handleNavigationStateChange}
            onError={handleError}
            onLoadEnd={handleLoadEnd}
            onHttpError={handleHttpError}
            onFileDownload={handleFileDownload}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onMessage={handleMessage}
            injectedJavaScript={fullInjectedJavaScript}
            injectedJavaScriptBeforeContentLoaded={fullInjectedJavaScript}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            startInLoadingState={false}
            pullToRefreshEnabled={true}
            allowsProtectedMedia={true}
            originWhitelist={['*']}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            scalesPageToFit={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            userAgent={
              Platform.OS === 'android'
                ? 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
                : undefined
            }
            allowsBackForwardNavigationGestures={true}
            mixedContentMode="always"
            cacheEnabled={true}
          />
          {isLoading && <LoadingIndicator />}
          {/* Floating Draggable QR Scanner Button - Hidden on login screen */}
          {!currentUrl.toLowerCase().includes('/login') && (
            <Animated.View
              style={[
                styles.qrButton,
                {
                  transform: [
                    { translateX: qrButtonX },
                    { translateY: qrButtonY },
                    { scale: qrButtonScale },
                  ],
                  opacity: qrButtonOpacity,
                },
              ]}
              {...qrButtonPanResponder.panHandlers}>
              <View style={styles.qrButtonInner}>
                <Image
                  source={require('../icons/qr-code.png')}
                  style={styles.qrButtonIcon}
                  resizeMode="contain"
                />
              </View>
            </Animated.View>
          )}
        </View>
      )}
      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScan}
        navigation={navigation}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  qrButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  qrButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  qrButtonIcon: {
    width: 28,
    height: 28,
    tintColor: Colors.textPrimary || '#000',
  },
});

export default WebViewScreen;

