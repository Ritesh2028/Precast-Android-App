import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Dimensions,
  ScrollView,
  Keyboard,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import Logo from '../components/Logo';

const { width, height } = Dimensions.get('window');

const ForgotPasswordScreen = ({ navigation, onBack }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(Dimensions.get('window').height);
  
  // Animation values
  const slideAnim = useRef(new Animated.Value(width)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    // Slide in animation when component mounts
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
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

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  const handleSendResetLink = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Alert.alert(
        'Reset Link Sent',
        'We have sent a password reset link to your email address. Please check your inbox and follow the instructions.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (onBack) {
                onBack();
              } else if (navigation) {
                navigation.goBack();
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to send reset link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    // Slide out animation before going back
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (onBack) {
        onBack();
      } else if (navigation) {
        navigation.goBack();
      }
    });
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
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
        <Animated.View 
          style={[
            styles.screenContainer,
            {
              transform: [{ translateX: slideAnim }],
              opacity: fadeAnim,
            }
          ]}
        >
          <View style={[
            styles.content,
            isKeyboardVisible && styles.contentKeyboard
          ]}>
            {/* Header with Logo */}
            <Animated.View style={[
              styles.header,
              isKeyboardVisible && styles.headerKeyboard,
              { transform: [{ scale: logoScaleAnim }] }
            ]}>
              <Logo />
              <Text style={[
                styles.title,
                isKeyboardVisible && styles.titleKeyboard
              ]}>
                Forgot Password
              </Text>
              <Text style={[
                styles.subtitle,
                isKeyboardVisible && styles.subtitleKeyboard
              ]}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>
            </Animated.View>

            {/* Form Container */}
            <View style={styles.formContainer}>
              <View style={[
                styles.form,
                isKeyboardVisible && styles.formKeyboard
              ]}>
                <View style={[
                  styles.inputContainer,
                  isKeyboardVisible && styles.inputContainerKeyboard
                ]}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.emailIcon}>✉</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email address"
                      placeholderTextColor="#999"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSendResetLink}
                    />
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.sendButton, isLoading && styles.sendButtonDisabled]} 
                  onPress={handleSendResetLink}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.backToSignIn} onPress={handleBack}>
                  <Text style={styles.backToSignInIcon}>←</Text>
                  <Text style={styles.backToSignInText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: Dimensions.get('window').height,
  },
  scrollContentKeyboard: {
    paddingBottom: 20,
    minHeight: Dimensions.get('window').height * 0.6,
  },
  screenContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
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
    fontSize: FontSizes.extraLarge + 8,
    fontWeight: FontWeights.bold,
    color: Colors.textDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleKeyboard: {
    fontSize: FontSizes.large,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  subtitleKeyboard: {
    fontSize: FontSizes.small,
  },
  formContainer: {
    width: '100%',
  },
  form: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
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
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
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
    fontSize: FontSizes.medium,
    color: Colors.textSecondary,
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    padding: 0,
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
});

export default ForgotPasswordScreen;
