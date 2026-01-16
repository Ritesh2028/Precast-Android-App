import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import Logo from '../components/Logo';
import DeviceLimitModal from '../components/DeviceLimitModal';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { API_BASE_URL } from '../config/apiConfig';
import { login as loginRequest, logout as logoutService } from '../services/authService';
import { clearAllTokens } from '../services/tokenManager';
import { stopTokenRefreshService } from '../services/tokenRefreshService';

const { width } = Dimensions.get('window');

// Get public IP function
async function getPublicIp() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) return undefined;
    const json = await response.json();
    return json && json.ip ? json.ip : undefined;
  } catch {
    return undefined;
  }
}

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(Dimensions.get('window').height);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showDeviceLimitModal, setShowDeviceLimitModal] = useState(false);
  const [deviceLimitData, setDeviceLimitData] = useState(null);
  const [pendingLoginCredentials, setPendingLoginCredentials] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const formSlideAnim = useRef(new Animated.Value(0)).current;

  // Animation effect on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Keyboard event listeners
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });

    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    const dimensionListener = Dimensions.addEventListener('change', ({ window }) => {
      setScreenHeight(window.height);
    });

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
      dimensionListener?.remove();
    };
  }, []);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (trimmedEmail === '' || trimmedPassword === '') {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Clear any previous session before new login
      console.log('🔄 [LoginScreen] Clearing previous session...');
      try {
        stopTokenRefreshService();
        await logoutService(); // This will clear tokens and stop services
      } catch (cleanupError) {
        console.warn('⚠️ [LoginScreen] Error during cleanup:', cleanupError);
        // Continue with login even if cleanup fails
      }

      // Small delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 100));

      const ip = await getPublicIp();

      console.log('📱 [LoginScreen] Attempting login...');
      
      // Helper function to handle successful login
      const handleSuccessfulLogin = async (responseData) => {
        // Check if user has role access (case-insensitive)
      // Try multiple possible role fields: role, role_name, user_role
      const userRole = (
        responseData?.role || 
        responseData?.role_name || 
        responseData?.user_role ||
        ''
      ).toString().toLowerCase().trim();

      console.log('📱 [LoginScreen] User role detected:', userRole);
        console.log('📱 [LoginScreen] Full role data from response:', {
          role: responseData?.role,
          role_name: responseData?.role_name,
          user_role: responseData?.user_role,
          normalized: userRole
        });
      
      // Small delay before navigation to ensure state is ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
        // Check role and navigate to appropriate screen
        if (!userRole) {
          // No role found, navigate to WebView screen
          console.log('📱 [LoginScreen] No role found, navigating to WebView');
        navigation.replace('WebView', { url: 'https://precast.blueinvent.com/' });
        return;
      }

        // Check for QA/QC role (case-insensitive, handle variations)
        const isQAQC = userRole === 'qa/qc' || userRole === 'qa-qc' || userRole === 'qa_qc' || userRole === 'qa qc';
        
        // Check for ErectionManager role (handle various formats and typos)
        const isErectionManager = 
          userRole === 'erectionmanager' || 
          userRole === 'erection_manager' || 
          userRole === 'erection manager' ||
          userRole === 'erectionmanger' || // Common typo
          userRole === 'erection managaer' || // API typo: "managaer" instead of "manager"
          userRole === 'erectionmanagaer' ||
          (userRole.includes('erection') && (userRole.includes('manager') || userRole.includes('managaer')));
        
        // Check for StockManager role (handle various formats and typos)
        const isStockManager = 
          userRole === 'stockmanager' || 
          userRole === 'stock_manager' || 
          userRole === 'stock manager' ||
          userRole === 'stockmanger' || // Common typo
          userRole === 'stock managaer' || // API typo: "managaer" instead of "manager"
          userRole === 'stockmanagaer' ||
          (userRole.includes('stock') && (userRole.includes('manager') || userRole.includes('managaer')));
        
        // Check for DispatchManager role (handle various formats and typos)
        const isDispatchManager = 
          userRole === 'dispatchmanager' || 
          userRole === 'dispatch_manager' || 
          userRole === 'dispatch manager' ||
          userRole === 'dispatchmanger' || // Common typo
          userRole === 'dispatch managaer' || // API typo: "managaer" instead of "manager"
          userRole === 'dispatchmanagaer' ||
          (userRole.includes('dispatch') && (userRole.includes('manager') || userRole.includes('managaer')));

        if (isQAQC) {
      // User has QA/QC role, navigate to Dashboard
      console.log('📱 [LoginScreen] User has QA/QC role, navigating to Dashboard');
      navigation.replace('Dashboard');
      console.log('✅ [LoginScreen] Navigation to Dashboard initiated');
        } else if (isErectionManager) {
          // User has ErectionManager role, navigate to ErectionManagerScreen
          console.log('📱 [LoginScreen] User has ErectionManager role, navigating to ErectionManagerScreen');
          navigation.replace('ErectionManager');
          console.log('✅ [LoginScreen] Navigation to ErectionManagerScreen initiated');
        } else if (isStockManager) {
          // User has StockManager role, navigate to StockManagerScreen
          console.log('📱 [LoginScreen] User has StockManager role, navigating to StockManagerScreen');
          console.log('📱 [LoginScreen] Detected role value:', userRole);
          navigation.replace('StockManager');
          console.log('✅ [LoginScreen] Navigation to StockManagerScreen initiated');
        } else if (isDispatchManager) {
          // User has DispatchManager role, navigate to DispatchManagerScreen
          console.log('📱 [LoginScreen] User has DispatchManager role, navigating to DispatchManagerScreen');
          navigation.replace('DispatchManager');
          console.log('✅ [LoginScreen] Navigation to DispatchManagerScreen initiated');
        } else {
          // User doesn't have any recognized role, navigate to WebView screen
          console.log('📱 [LoginScreen] User role is not recognized, navigating to WebView');
          console.log('📱 [LoginScreen] User role value:', userRole);
          navigation.replace('WebView', { url: 'https://precast.blueinvent.com/' });
          console.log('✅ [LoginScreen] Navigation to WebView initiated');
        }
      };
      
      try {
        const responseData = await loginRequest({ email: trimmedEmail, password: trimmedPassword, ip });
        console.log('📱 [LoginScreen] Login response data:', JSON.stringify(responseData, null, 2));
        
        // Check if login was successful (has access_token)
        if (!responseData?.access_token) {
          throw new Error('Login failed: No access token received');
        }
        
        // Continue with normal login flow
        await handleSuccessfulLogin(responseData);
      } catch (loginError) {
        // Check if this is a device limit error (409 status or requires_logout flag)
        const errorStatus = loginError?.response?.status;
        const errorResponse = loginError?.response?.data || loginError?.data || {};
        
        // Handle 409 status code (device limit reached) or requires_logout flag
        if (errorStatus === 409 || (errorResponse.requires_logout === true && errorResponse.active_devices)) {
          console.log('📱 [LoginScreen] Device limit reached (Status:', errorStatus, '), showing modal');
          console.log('📱 [LoginScreen] Device limit data:', JSON.stringify(errorResponse, null, 2));
          
          setDeviceLimitData({
            activeDevices: errorResponse.active_devices || [],
            maxDevices: errorResponse.max_devices || 3,
            currentDevices: errorResponse.current_devices || (errorResponse.active_devices?.length || 0),
            message: errorResponse.message || 'You have reached the maximum limit of 3 active devices.',
          });
          setPendingLoginCredentials({ email: trimmedEmail, password: trimmedPassword, ip });
          setShowDeviceLimitModal(true);
          setIsLoading(false);
          return;
        }
        
        // Re-throw other errors
        throw loginError;
      }
    } catch (err) {
      // Device limit errors are already handled above
      const errorStatus = err?.response?.status;
      const errorResponse = err?.response?.data || err?.data || {};
      
      if (errorStatus === 409 || errorResponse.requires_logout) {
        return; // Already handled, don't show error
      }
      
      // Handle other error status codes
      let message = 'Network error';
      if (errorStatus === 401) {
        message = 'Invalid email or password';
      } else if (errorStatus === 429) {
        message = 'Too many attempts. Please try again later.';
      } else if (errorStatus === 403) {
        message = 'Account is suspended. Please contact support.';
      } else {
        message = errorResponse?.message || errorResponse?.error || err?.message || 'Network error';
      }
      
      console.error('❌ [LoginScreen] Login error:', message);
      setError(message);
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeviceLogout = async (sessionId, deviceIndex) => {
    try {
      // After device logout, close modal and show success
      console.log('📱 [LoginScreen] Device logged out, preparing to retry login...');
      setShowDeviceLimitModal(false);
      
      // Show success message
      setError('Device logged out successfully. You can now try logging in again.');
      setTimeout(() => {
        setError('');
      }, 4000);
      
      // Clear device limit data
      setDeviceLimitData(null);
      
      // Small delay to ensure logout completes
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Retry login with pending credentials
      if (pendingLoginCredentials) {
        setIsLoading(true);
        setError('');
        
        try {
          const responseData = await loginRequest(pendingLoginCredentials);
          
          if (responseData?.access_token) {
            // Helper function to handle successful login (same as in handleLogin)
            const handleSuccessfulLogin = async (responseData) => {
              const userRole = (
                responseData?.role || 
                responseData?.role_name || 
                responseData?.user_role ||
                ''
              ).toString().toLowerCase().trim();

              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Check role and navigate accordingly
              const isQAQC = userRole === 'qa/qc' || userRole === 'qa-qc' || userRole === 'qa_qc' || userRole === 'qa qc';
              const isErectionManager = 
                userRole === 'erectionmanager' || 
                userRole === 'erection_manager' || 
                userRole === 'erection manager' ||
                userRole === 'erectionmanger' || // Common typo
                userRole === 'erection managaer' || // API typo: "managaer" instead of "manager"
                userRole === 'erectionmanagaer' ||
                (userRole.includes('erection') && (userRole.includes('manager') || userRole.includes('managaer')));
              const isStockManager = 
                userRole === 'stockmanager' || 
                userRole === 'stock_manager' || 
                userRole === 'stock manager' ||
                userRole === 'stockmanger' || // Common typo
                userRole === 'stock managaer' || // API typo: "managaer" instead of "manager"
                userRole === 'stockmanagaer' ||
                (userRole.includes('stock') && (userRole.includes('manager') || userRole.includes('managaer')));
              const isDispatchManager = 
                userRole === 'dispatchmanager' || 
                userRole === 'dispatch_manager' || 
                userRole === 'dispatch manager' ||
                userRole === 'dispatchmanger' || // Common typo
                userRole === 'dispatch managaer' || // API typo: "managaer" instead of "manager"
                userRole === 'dispatchmanagaer' ||
                (userRole.includes('dispatch') && (userRole.includes('manager') || userRole.includes('managaer')));

              if (isQAQC) {
                navigation.replace('Dashboard');
              } else if (isErectionManager) {
                navigation.replace('ErectionManager');
              } else if (isStockManager) {
                navigation.replace('StockManager');
              } else if (isDispatchManager) {
                navigation.replace('DispatchManager');
              } else {
                navigation.replace('WebView', { url: 'https://precast.blueinvent.com/' });
              }
            };
            
            await handleSuccessfulLogin(responseData);
          }
        } catch (retryError) {
          // Check if device limit error again (409 status or requires_logout flag)
          const errorStatus = retryError?.response?.status;
          const errorResponse = retryError?.response?.data || retryError?.data || {};
          
          if (errorStatus === 409 || (errorResponse.requires_logout === true && errorResponse.active_devices)) {
            // Update device list and show modal again
            setDeviceLimitData({
              activeDevices: errorResponse.active_devices || [],
              maxDevices: errorResponse.max_devices || 3,
              currentDevices: errorResponse.current_devices || (errorResponse.active_devices?.length || 0),
              message: errorResponse.message || 'You have reached the maximum limit of 3 active devices.',
            });
            setShowDeviceLimitModal(true);
            setIsLoading(false);
            return;
          }
          
          throw retryError;
        }
      }
    } catch (error) {
      console.error('❌ [LoginScreen] Error retrying login after device logout:', error);
      const message = error?.response?.data?.message || error?.message || 'Failed to login after device logout';
      setError(message);
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
      setPendingLoginCredentials(null);
    }
  };

  const handleForgotPassword = () => {
    setShowForgotPassword(true);
    setResetSent(false);
    Animated.timing(formSlideAnim, {
      toValue: -width,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotEmail('');
    setResetSent(false);
    Animated.timing(formSlideAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const handleSendResetLink = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!isValidEmail(forgotEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setForgotLoading(true);
    
    try {
      const resp = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const message = (data && (data.message || data.error)) || `Request failed (status ${resp.status})`;
        Alert.alert('Error', message);
        return;
      }

      if (data && data.message && data.message.toLowerCase().includes('reset link')) {
        setResetSent(true);
      } else {
        // If API format changes, still proceed to success to match UX
        setResetSent(true);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send reset link. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundContainer}>
        <KeyboardAvoidingView 
          style={styles.keyboardContainer} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          enabled={true}
        >
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={[
              styles.scrollContent,
              isKeyboardVisible && {
                ...styles.scrollContentKeyboard,
                paddingBottom: keyboardHeight > 0 ? keyboardHeight + 20 : 20,
              }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={true}
            bounces={false}
          >
        <View style={[
          styles.content,
          isKeyboardVisible && styles.contentKeyboard
        ]}>
          <Animated.View style={[
            styles.header,
            isKeyboardVisible && styles.headerKeyboard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}>
            <Animated.View style={{
              transform: [{ scale: logoScaleAnim }],
            }}>
              <Logo 
                size={isKeyboardVisible ? "small" : "medium"} 
              />
            </Animated.View>
            
            
            <Text style={[
              styles.subtitle,
              isKeyboardVisible && styles.subtitleKeyboard
            ]}>
              {showForgotPassword ? 'Enter your email address and we\'ll send you a link to reset your password.' : 'Sign in to your account'}
            </Text>
          </Animated.View>

          <View style={styles.formContainer}>
            <View style={[
              styles.form,
              isKeyboardVisible && styles.formKeyboard
            ]}>
              {!showForgotPassword ? (
                // Login Form
                <>
                  <View style={[
                    styles.inputContainer,
                    isKeyboardVisible && styles.inputContainerKeyboard
                  ]}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Enter your email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="next"
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={[
                    styles.inputContainer,
                    isKeyboardVisible && styles.inputContainerKeyboard
                  ]}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[styles.input, styles.passwordInput]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter your password"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                      />
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowPassword(!showPassword)}
                      >
                        <Image
                          source={showPassword ? require('../icons/hide.png') : require('../icons/show.png')}
                          style={styles.eyeIcon}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </View>
                    {error ? (
                      <Text style={styles.errorText}>⚠️ {error}</Text>
                    ) : null}
                  </View>

                  <View style={styles.loginRowContainer}>
                    <TouchableOpacity 
                      style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
                      onPress={handleLogin}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={Colors.textWhite} size="small" />
                      ) : (
                        <Text style={styles.loginButtonText}>Login</Text>
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.forgotPasswordButton} 
                      onPress={handleForgotPassword}
                    >
                      <Text style={styles.forgotPasswordText}>Forgot Password</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                // Forgot Password: show form OR success confirmation
                <>
                  {!resetSent ? (
                    <>
                      <View style={[
                        styles.inputContainer,
                        isKeyboardVisible && styles.inputContainerKeyboard
                      ]}>
                        <Text style={styles.label}>Email Address</Text>
                        <View style={styles.forgotInputWrapper}>
                          <Text style={styles.emailIcon}>✉</Text>
                          <TextInput
                            style={styles.forgotInput}
                            placeholder="Enter your email address"
                            placeholderTextColor="#999"
                            value={forgotEmail}
                            onChangeText={setForgotEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                            onSubmitEditing={handleSendResetLink}
                          />
                        </View>
                      </View>

                      <View style={styles.loginRowContainer}>
                        <TouchableOpacity 
                          style={[styles.loginButton, forgotLoading && styles.loginButtonDisabled]} 
                          onPress={handleSendResetLink}
                          disabled={forgotLoading}
                        >
                          {forgotLoading ? (
                        <ActivityIndicator color={Colors.textWhite} size="small" />
                          ) : (
                            <Text style={styles.loginButtonText}>Send Reset Link</Text>
                          )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={styles.forgotPasswordButton} 
                          onPress={handleBackToLogin}
                        >
                          <Text style={styles.forgotPasswordText}>Back to Sign In</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    // Success state UI
                    <>
                      <Text style={styles.successTitle}>Check Your Email</Text>
                      <View style={styles.successIconCircle}>
                        <Text style={styles.successIcon}>✓</Text>
                      </View>
                      <Text style={styles.successHeading}>Check Your Email</Text>
                      <Text style={styles.successBody}>
                        We've sent a password reset link to your email address.
                      </Text>
                      <Text style={styles.successHint}>
                        If you don't see the email, check your spam folder.
                      </Text>

                      <TouchableOpacity style={styles.successBackButton} onPress={handleBackToLogin}>
                        <Text style={styles.successBackIcon}>←</Text>
                        <Text style={styles.successBackText}>Back to Sign In</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => setResetSent(false)}>
                        <Text style={styles.successRetry}>Didn't receive the email? Try again</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>

      {/* Device Limit Modal */}
      <DeviceLimitModal
        visible={showDeviceLimitModal}
        onClose={() => {
          if (!deviceLimitData?.loggingOutDevice) {
          setShowDeviceLimitModal(false);
          setDeviceLimitData(null);
          setPendingLoginCredentials(null);
          }
        }}
        activeDevices={deviceLimitData?.activeDevices || []}
        maxDevices={deviceLimitData?.maxDevices || 3}
        currentDevices={deviceLimitData?.currentDevices || 0}
        message={deviceLimitData?.message}
        onDeviceLogout={handleDeviceLogout}
      />
</View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: Dimensions.get('window').height,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  scrollContentKeyboard: {
    paddingBottom: 20,
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  contentKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  headerKeyboard: {
    marginBottom: 32,
  },
  title: {
    fontSize: FontSizes.extraLarge + 12,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleKeyboard: {
    fontSize: FontSizes.large + 4,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSizes.medium + 2,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  subtitleKeyboard: {
    fontSize: FontSizes.small + 2,
  },
  // Success state styles
  successTitle: {
    display: 'none',
  },
  successIconCircle: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E6F9EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 48,
    color: '#22C55E',
    lineHeight: 48,
  },
  successHeading: {
    fontSize: FontSizes.large + 6,
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  successBody: {
    fontSize: FontSizes.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  successHint: {
    fontSize: FontSizes.small + 1,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  successBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  successBackIcon: {
    color: '#fff',
    fontSize: FontSizes.medium,
    marginRight: 8,
  },
  successBackText: {
    color: '#fff',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.semiBold,
  },
  successRetry: {
    color: Colors.primary,
    textAlign: 'center',
    fontSize: FontSizes.medium,
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  formContainer: {
    width: '100%',
    alignItems: 'center',
  },
  form: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingVertical: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  formKeyboard: {
    padding: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputContainerKeyboard: {
    marginBottom: 12,
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: FontSizes.regular,
    height: 48,
    color: Colors.textPrimary,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  loginRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  loginButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#0056CC',
  },
  loginButtonText: {
    color: Colors.textWhite,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -18 }],
    padding: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    width: 22,
    height: 22,
    tintColor: '#6B7280',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: FontSizes.small,
    marginTop: 8,
  },
  forgotPasswordContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  forgotPassword: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  forgotPasswordButton: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  forgotPasswordText: {
    color: Colors.primary,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.4,
  },
  // Forgot password styles
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emailIcon: {
    fontSize: FontSizes.medium + 4,
    color: Colors.primary,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: Colors.textWhite,
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  backToSignIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  backToSignInIcon: {
    fontSize: FontSizes.medium,
    color: Colors.primary,
    marginRight: 8,
  },
  backToSignInText: {
    fontSize: FontSizes.regular,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  // Specific styles for forgot password form to match image design
  forgotInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  forgotInput: {
    flex: 1,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    padding: 0,
    marginLeft: 8,
  },
  forgotSendButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  forgotSendButtonDisabled: {
    opacity: 0.6,
  },
  forgotSendButtonText: {
    color: Colors.textWhite,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  forgotBackToSignIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginTop: 24,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  forgotBackIcon: {
    fontSize: FontSizes.medium + 2,
    color: Colors.primary,
    marginRight: 8,
  },
  forgotBackText: {
    fontSize: FontSizes.regular + 2,
    color: Colors.primary,
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.5,
  },
});

export default LoginScreen;
