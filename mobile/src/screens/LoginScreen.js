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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Logo from '../components/Logo';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

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
      const ip = await getPublicIp();

      const response = await fetch('https://precast.blueinvent.com/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
          ...(ip ? { ip } : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = (data && (data.message || data.error)) || `Login failed (status ${response.status})`;
        setError(message);
        Alert.alert('Login Failed', message);
        return;
      }

      // Check if user has QC access
      if (data && data.qc !== true) {
        const message = 'You do not have QC access. Please contact your administrator.';
        setError(message);
        Alert.alert('Access Denied', message);
        return;
      }

      // Store token if available
      if (data && data.token) {
        try {
          await AsyncStorage.setItem('auth_token', data.token);
        } catch (e) {
          console.log('Failed to store token:', e);
        }
      }

     
      navigation.replace('Dashboard');
    } catch (err) {
      setError('Network error');
      Alert.alert('Network Error', 'Please check your connection and try again');
    } finally {
      setIsLoading(false);
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
      const resp = await fetch('https://precast.blueinvent.com/api/auth/forgot-password', {
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={[
              styles.scrollContent,
              isKeyboardVisible && styles.scrollContentKeyboard
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={isKeyboardVisible}
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
              styles.title,
              isKeyboardVisible && styles.titleKeyboard
            ]}>
              {showForgotPassword ? 'Forgot Password' : 'Welcome Back'}
            </Text>
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
                        <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '🙈'}</Text>
                      </TouchableOpacity>
                    </View>
                    {error ? (
                      <Text style={styles.errorText}>⚠️ {error}</Text>
                    ) : null}
                  </View>

                  <View style={styles.forgotPasswordContainer}>
                    <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
                      <Text style={styles.forgotPasswordText}>Forgot your password</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity 
                    style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
                    onPress={handleLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.loginButtonText}>Login</Text>
                    )}
                  </TouchableOpacity>
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

                      <TouchableOpacity 
                        style={[styles.forgotSendButton, forgotLoading && styles.forgotSendButtonDisabled]} 
                        onPress={handleSendResetLink}
                        disabled={forgotLoading}
                      >
                        {forgotLoading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.forgotSendButtonText}>Send Reset Link</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.forgotBackToSignIn} onPress={handleBackToLogin}>
                        <Text style={styles.forgotBackIcon}>←</Text>
                        <Text style={styles.forgotBackText}>Back to Sign In</Text>
                      </TouchableOpacity>
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
  },
  scrollContentKeyboard: {
    paddingBottom: 20,
    minHeight: Dimensions.get('window').height * 0.6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  contentKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingBottom: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  headerKeyboard: {
    marginBottom: 16,
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
    marginBottom: 24,
  },
  inputContainerKeyboard: {
    marginBottom: 16,
  },
  label: {
    fontSize: FontSizes.regular + 2,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: '#e3f2fd',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: FontSizes.regular + 2,
    height: 60,
    color: Colors.textPrimary,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: FontSizes.medium + 2,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    top: 12,
    padding: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  eyeIcon: {
    fontSize: FontSizes.medium,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: FontSizes.small,
    marginTop: 8,
  },
  forgotPasswordContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  forgotPassword: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  forgotPasswordText: {
    color: '#007AFF',
    fontSize: FontSizes.regular + 2,
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.5,
  },
  // Forgot password styles
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emailIcon: {
    fontSize: FontSizes.medium + 4,
    color: '#007AFF',
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: '#007AFF',
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
    color: '#fff',
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
    color: '#007AFF',
    marginRight: 8,
  },
  backToSignInText: {
    fontSize: FontSizes.regular,
    color: '#007AFF',
    fontWeight: FontWeights.medium,
  },
  // Specific styles for forgot password form to match image design
  forgotInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: '#e3f2fd',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  forgotInput: {
    flex: 1,
    fontSize: FontSizes.regular + 2,
    color: Colors.textPrimary,
    padding: 0,
    marginLeft: 12,
  },
  forgotSendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  forgotSendButtonDisabled: {
    opacity: 0.6,
  },
  forgotSendButtonText: {
    color: '#fff',
    fontSize: FontSizes.medium + 2,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    color: '#007AFF',
    marginRight: 8,
  },
  forgotBackText: {
    fontSize: FontSizes.regular + 2,
    color: '#007AFF',
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.5,
  },
});

export default LoginScreen;
