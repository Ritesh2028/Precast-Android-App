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
import { Colors, Theme } from '../styles/colors';
import { API_BASE_URL } from '../config/apiConfig';
import { login as loginRequest, logout as logoutService, getClientIp } from '../services/authService';
import { completeLoginAndNavigate } from '../services/appAccess';
import { stopTokenRefreshService } from '../services/tokenRefreshService';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginStatus, setLoginStatus] = useState('');
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
    // Send the password exactly as typed (same as the web app); only use trim to reject blank input.
    const trimmedPassword = password;

    if (trimmedEmail === '' || password.trim() === '') {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError('');
    setLoginStatus('Preparing login...');
    console.log('📱 [LoginScreen] handleLogin started', { email: trimmedEmail });

    try {
      // Clear any previous session before new login
      setLoginStatus('Clearing previous session...');
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

      const ip = await getClientIp();
      setLoginStatus(`Contacting server (IP: ${ip})...`);
      console.log('📱 [LoginScreen] Client IP for login:', ip);

      console.log('📱 [LoginScreen] Attempting login...', {
        email: trimmedEmail,
        api: API_BASE_URL,
      });
      
      try {
        setLoginStatus('Sending login request...');
        const responseData = await loginRequest({ email: trimmedEmail, password: trimmedPassword, ip });
        
        if (!responseData?.access_token) {
          throw new Error('Login failed: No access token received');
        }
        
        setLoginStatus('Loading access...');
        await completeLoginAndNavigate(navigation, responseData);
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
      const rawMessage = (err?.message || '').toLowerCase();
      if (
        err?.code === 'ECONNABORTED' ||
        rawMessage.includes('timeout') ||
        err?.name === 'AbortError'
      ) {
        message = 'Connection timed out. Check your internet and try again.';
      } else if (
        rawMessage === 'network error' ||
        rawMessage === 'network request failed' ||
        rawMessage.includes('failed to fetch')
      ) {
        message = `Cannot reach server (${API_BASE_URL.replace(/^https?:\/\//, '')}). Check your internet connection.`;
      } else if (errorStatus === 400) {
        message = errorResponse?.message || errorResponse?.error || 'Invalid login request. Please check email and password.';
      } else if (errorStatus === 401) {
        message = errorResponse?.message || errorResponse?.error || 'Invalid email or password';
      } else if (errorStatus === 429) {
        message = 'Too many attempts. Please try again later.';
      } else if (errorStatus === 403) {
        const errText = String(errorResponse?.error || errorResponse?.message || '').toLowerCase();
        if (errText.includes('password_reset_required')) {
          message = 'You must reset your password before signing in. Use Forgot Password.';
        } else {
          message = errorResponse?.message || errorResponse?.error || 'Account is suspended. Please contact support.';
        }
      } else if (!err?.response && err?.message) {
        message = `Unable to reach server. (${err.message})`;
      } else {
        message = errorResponse?.message || errorResponse?.error || err?.message || 'Network error';
      }
      
      console.error('❌ [LoginScreen] Login error:', message);
      console.error('❌ [LoginScreen] Login error details:', {
        message: err?.message,
        code: err?.code,
        status: errorStatus,
        data: errorResponse,
        api: API_BASE_URL,
      });
      setError(message);
      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
      setLoginStatus('');
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
            await completeLoginAndNavigate(navigation, responseData);
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          // Android already uses windowSoftInputMode=adjustResize — KAV "height"
          // remounts layout and often dismisses the soft keyboard in the emulator.
          enabled={Platform.OS === 'ios'}
        >
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            scrollEnabled={true}
            bounces={false}
          >
        <View style={styles.content}>
          <Animated.View style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}>
            <Animated.View style={{
              transform: [{ scale: logoScaleAnim }],
            }}>
              <Logo
                size="medium"
                variant="light"
                iconOnly
                showName
              />
            </Animated.View>
            
            
            <Text style={styles.subtitle}>
              {showForgotPassword ? 'Enter your email address and we\'ll send you a link to reset your password.' : 'Sign in to your account'}
            </Text>
          </Animated.View>

          <View style={styles.formContainer}>
            <View style={styles.form}>
              {!showForgotPassword ? (
                // Login Form
                <>
                  <View style={styles.inputContainer}>
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
                      showSoftInputOnFocus={true}
                      importantForAutofill="yes"
                      textContentType="emailAddress"
                      autoComplete="email"
                    />
                  </View>

                  <View style={styles.inputContainer}>
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
                        showSoftInputOnFocus={true}
                        textContentType="password"
                        autoComplete="password"
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
                    {isLoading && loginStatus ? (
                      <Text style={styles.statusText}>{loginStatus}</Text>
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
                      <View style={styles.inputContainer}>
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
                            showSoftInputOnFocus={true}
                            textContentType="emailAddress"
                            autoComplete="email"
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
        email={pendingLoginCredentials?.email}
        password={pendingLoginCredentials?.password}
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
    color: Colors.success,
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
    borderColor: Colors.border,
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
    borderColor: Colors.primarySoft,
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
    borderRadius: Theme.radius,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: Colors.brandNavy,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  loginButtonText: {
    color: Colors.primaryForeground,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.2,
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
    tintColor: Colors.textSecondary,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSizes.small,
    marginTop: 8,
  },
  statusText: {
    color: Colors.primary,
    fontSize: FontSizes.small,
    marginTop: 8,
    textAlign: 'center',
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
    borderColor: Colors.border,
  },
  forgotPasswordButton: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
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
    borderColor: Colors.border,
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
    shadowColor: Colors.primary,
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
    borderColor: Colors.primarySoft,
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
    shadowColor: Colors.primary,
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
    borderColor: Colors.border,
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
