import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomNavigation from '../components/BottomNavigation';
import CameraQRScanner from '../components/CameraQRScanner';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const UserProfileScreen = ({ navigation, hideBottomNav = false }) => {
  const [userInfo, setUserInfo] = useState({
    id: null,
    employee_id: '',
    email: '',
    first_name: '',
    last_name: '',
    role_name: '',
    address: '',
    city: '',
    state: '',
    country: '',
    zip_code: '',
    phone_no: '',
    phone_code: '',
    phone_code_name: '',
    profile_picture: '',
    is_admin: false,
    suspended: false,
    created_at: '',
    first_access: '',
    last_access: '',
  });

  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [activeTab, setActiveTab] = useState('me');
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changeEmail, setChangeEmail] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // In a real app, you'd fetch user data from API using stored token
    loadUserData();
  }, []);

  const validateToken = (token) => {
    if (!token) return false;
    // Check if token is a valid JWT format
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // Check if token is expired
    try {
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch (error) {
      console.log('Token validation error:', error);
      return false;
    }
  };

  const refreshToken = async () => {
    try {
      const refreshTokenValue = await AsyncStorage.getItem('refresh_token');
      if (!refreshTokenValue) {
        console.log('No refresh token found');
        return null;
      }

      const response = await fetch('https://precast.blueinvent.com/api/refresh_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: refreshTokenValue
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('auth_token', data.access_token);
        if (data.refresh_token) {
          await AsyncStorage.setItem('refresh_token', data.refresh_token);
        }
        return data.access_token;
      }
      return null;
    } catch (error) {
      console.log('Token refresh error:', error);
      return null;
    }
  };


  const loadUserData = async (showFullLoader = true) => {
    try {
      if (showFullLoader) setLoading(true);
      const token = await AsyncStorage.getItem('auth_token');
      console.log('Auth token found:', token ? 'Yes' : 'No');
      
      if (token) {
        // Validate token format and expiration
        if (!validateToken(token)) {
          console.log('Token is invalid or expired');
          Alert.alert('Session Expired', 'Your session has expired. Please login again.');
          await AsyncStorage.removeItem('auth_token');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
          return;
        }
        const apiUrl = 'https://precast.blueinvent.com/api/get_user';
        console.log('Making API call to:', apiUrl);
        console.log('Using token:', token.substring(0, 20) + '...');
        
        // Use Authorization header with token directly (without Bearer prefix)
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'PrecastApp/1.0',
          },
        });
        
        console.log('Full token:', token);
        console.log('Token length:', token.length);
        console.log('Request headers:', {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (response.ok) {
          const userData = await response.json();
          console.log('User data loaded successfully:', userData);
          setUserInfo(userData);
          if (showFullLoader) setLoading(false);
        } else {
          const errorText = await response.text();
          console.log('API Error Response:', errorText);
          console.log('Response status:', response.status);
          console.log('Response statusText:', response.statusText);
          
          if (response.status === 404) {
            console.log('404 Error - Session not found');
            // Check if it's a session issue
            if (errorText.includes('Session not found')) {
              console.log('Session not found - trying alternative authentication methods');
              
              // Try with Bearer prefix
              console.log('Trying authentication with Bearer prefix...');
              const altResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                  'User-Agent': 'PrecastApp/1.0',
                },
              });
              
              console.log('Alternative auth response status:', altResponse.status);
              
              if (altResponse.ok) {
                const userData = await altResponse.json();
                console.log('User data loaded with alternative auth:', userData);
                setUserInfo(userData);
                if (showFullLoader) setLoading(false);
                return;
              }
              
              // Try with different header name
              console.log('Trying with X-Auth-Token header...');
              const tokenResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'X-Auth-Token': token,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                  'User-Agent': 'PrecastApp/1.0',
                },
              });
              
              console.log('X-Auth-Token response status:', tokenResponse.status);
              
              if (tokenResponse.ok) {
                const userData = await tokenResponse.json();
                console.log('User data loaded with X-Auth-Token:', userData);
                setUserInfo(userData);
                if (showFullLoader) setLoading(false);
                return;
              }
              
              console.log('All authentication methods failed - redirecting to login');
              await AsyncStorage.removeItem('auth_token');
              await AsyncStorage.removeItem('refresh_token');
              Alert.alert('Session Expired', 'Your session has expired. Please login again.');
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
              return;
            } else {
              console.log('404 Error - User not found');
              Alert.alert('Error', 'User not found. Please contact support.');
              if (showFullLoader) setLoading(false);
            }
          } else if (response.status === 401) {
            console.log('401 Authentication Error - redirecting to login');
            Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
            await AsyncStorage.removeItem('auth_token');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } else {
            console.log(`API Error Status: ${response.status}`);
            Alert.alert('Error', `Failed to load user data. Status: ${response.status}`);
            if (showFullLoader) setLoading(false);
          }
        }
      } else {
        console.log('No auth token found - redirecting to login');
        Alert.alert('Authentication Required', 'Please login to access your profile.');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    } catch (error) {
      console.log('Network/Request Error:', error);
      console.log('Error message:', error.message);
      Alert.alert('Network Error', 'Failed to load user data. Please check your internet connection and try again.');
      if (showFullLoader) setLoading(false);
    }
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadUserData(false);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  const performLogout = async () => {
    try {
      // Clear stored token
      await AsyncStorage.removeItem('auth_token');
      
      // Navigate to login screen
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
      
      Alert.alert('Logged Out', 'You have been successfully logged out');
    } catch (error) {
      console.log('Error during logout:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Profile editing feature coming soon!');
  };

  const handleChangePassword = () => {
    setShowChangePassword((prev) => !prev);
  };

  const handleSendResetLink = async () => {
    if (!changeEmail.trim()) {
      Alert.alert('Required', 'Please enter your email address.');
      return;
    }
    try {
      // Plug real API call here
      Alert.alert('Email sent', 'If this email is registered, a reset link has been sent.');
      setShowChangePassword(false);
      setChangeEmail('');
    } catch (e) {
      Alert.alert('Error', 'Could not send the reset link. Please try again.');
    }
  };

  const handleSettings = () => {
    Alert.alert('Settings', 'Settings feature coming soon!');
  };

  const handleTabPress = useCallback((tabId, screenName) => {
    setActiveTab(tabId);
    const state = navigation.getState?.();
    const currentRoute = state?.routes?.[state?.index || 0]?.name;
    if (!screenName) return;
    if (currentRoute === screenName) return; // prevent re-navigate/remount
    if (screenName !== 'UserProfile') {
      navigation.navigate(screenName);
    }
  }, [navigation]);

  const handleScanPress = () => {
    setQrScannerVisible(true);
  };

  const handleQRScanned = (data) => {
    Alert.alert(
      'QR Code Scanned',
      `Scanned data: ${data}`,
      [
        { text: 'OK' },
        { 
          text: 'View Job', 
          onPress: () => {
            const jobIdMatch = data.match(/JOB-\d+/);
            if (jobIdMatch) {
              navigation.navigate('JobDetails', { jobId: jobIdMatch[0] });
            } else {
              Alert.alert('Info', 'No job ID found in QR code');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.mainContainer, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading user data...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
        alwaysBounceVertical
        bounces
        overScrollMode="always"
      >
      <View style={styles.megaCard}>
      <View style={styles.header}>
        <View style={styles.headerBackground} />
        <View style={styles.profileImageContainer}>
          <View style={styles.profileImage}>
            {userInfo.profile_picture && !imageError ? (
              <Image 
                source={{ uri: `https://precast.blueinvent.com/api/get-file?file=${userInfo.profile_picture}` }}
                style={styles.profileImageSource}
                resizeMode="cover"
                onError={() => {
                  console.log('Profile image failed to load, showing initials');
                  setImageError(true);
                }}
              />
            ) : (
              <Text style={styles.profileInitials}>
                {userInfo.first_name ? userInfo.first_name[0] : ''}{userInfo.last_name ? userInfo.last_name[0] : ''}
              </Text>
            )}
          </View>
          <View style={styles.onlineIndicator} />
        </View>
        <View style={styles.userInfoContainer}>
          <Text style={styles.userName}>{userInfo.first_name} {userInfo.last_name}</Text>
          <Text style={styles.userRole}>{userInfo.role_name}</Text>
          <Text style={styles.userEmail}>{userInfo.email}</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.sectionHeaderRow}>
          <Image source={require('../icons/businessman.png')} style={styles.sectionIcon} resizeMode="contain" />
          <Text style={styles.sectionTitle}>Personal Information</Text>
        </View>
          <View style={styles.infoCard}>
          <View style={[styles.infoRow, { borderTopWidth: 0 }]}>
            <View style={styles.infoIconContainer}>
              <Text style={styles.infoIcon}>📞</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{userInfo.phone_code_name} {userInfo.phone_no}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/location.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{userInfo.address}, {userInfo.city}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/map.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{userInfo.state}, {userInfo.country}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/zip-code.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Zip Code</Text>
              <Text style={styles.infoValue}>{userInfo.zip_code}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/calendar.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Join Date</Text>
              <Text style={styles.infoValue}>{userInfo.created_at ? new Date(userInfo.created_at).toLocaleDateString() : 'N/A'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actionsSection}>
        <View style={styles.sectionHeaderRow}>
          <Image source={require('../icons/password (1).png')} style={styles.sectionIcon} resizeMode="contain" />
          <Text style={styles.sectionTitle}>Account Actions</Text>
        </View>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleChangePassword}>
          <View style={styles.actionIconContainer}>
            <Image source={require('../icons/password.png')} style={styles.actionIconImg} resizeMode="contain" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionButtonText}>Change Password</Text>
            <Text style={styles.actionSubtext}>Update your account security</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
        {showChangePassword && (
          <View style={styles.inlineForm}>
            <Text style={styles.inlineLabel}>Email Address</Text>
            <View style={styles.inlineInputWrapper}>
              <TextInput
                style={styles.inlineInput}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={changeEmail}
                onChangeText={setChangeEmail}
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity style={styles.inlinePrimaryButton} onPress={handleSendResetLink}>
              <Text style={styles.inlinePrimaryText}>Send Reset Link</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
          <View style={styles.actionIconContainer}>
            <Image source={require('../icons/work-process.png')} style={styles.actionIconImg} resizeMode="contain" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionButtonText}>Settings</Text>
            <Text style={styles.actionSubtext}>App preferences and configuration</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logoutSection}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
      </View>
      </ScrollView>

      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScanned}
        navigation={navigation}
      />

      {!hideBottomNav && (
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: 'transparent',
    padding: 0,
    marginBottom: 0,
    borderRadius: 0,
    marginHorizontal: 0,
    shadowColor: 'transparent',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: 'hidden',
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: '#666',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
    position: 'relative',
  },
  onlineIndicator: {
    display: 'none',
  },
  userInfoContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  adminBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  adminText: {
    color: Colors.textWhite,
    fontSize: 12,
    fontWeight: 'bold',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#666',
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#666',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  profileInitials: {
    fontSize: FontSizes.extraLarge,
    fontWeight: FontWeights.bold,
    color: Colors.textWhite,
  },
  profileImageSource: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  userName: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  userRole: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  userEmail: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  statusBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: Colors.textWhite,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  sectionHeaderRow: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'left',
  },
  sectionIcon: {
    width: 22,
    height: 22,
    tintColor: '#000',
    marginRight: 8,
  },
  infoSection: {
    backgroundColor: 'transparent',
    padding: 0,
    marginBottom: 0,
    borderRadius: 0,
    marginHorizontal: 0,
    shadowColor: 'transparent',
    elevation: 0,
  },
  infoCard: {
    backgroundColor: 'transparent',
    padding: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoIcon: {
    fontSize: FontSizes.icon,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
  },
  actionsSection: {
    backgroundColor: 'transparent',
    padding: 16,
    marginBottom: 0,
    borderRadius: 0,
    marginHorizontal: 0,
    shadowColor: 'transparent',
    elevation: 0,
  },
  actionButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 0,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionIcon: {
    fontSize: FontSizes.icon,
    color: Colors.textWhite,
  },
  iconImg: {
    width: 22,
    height: 22,
    tintColor: '#000',
  },
  actionIconImg: {
    width: 22,
    height: 22,
    tintColor: '#000',
  },
  actionContent: {
    flex: 1,
  },
  actionButtonText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
    marginBottom: 4,
  },
  actionSubtext: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    fontWeight: FontWeights.regular,
  },
  actionArrow: {
    fontSize: FontSizes.large,
    color: '#ccc',
    fontWeight: FontWeights.bold,
  },
  inlineForm: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  inlineLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 6,
  },
  inlineInputWrapper: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
  },
  inlineInput: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textDark,
  },
  inlinePrimaryButton: {
    marginTop: 12,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  inlinePrimaryText: {
    color: Colors.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  logoutSection: {
    backgroundColor: 'transparent',
    padding: 16,
    marginBottom: 0,
    borderRadius: 0,
    marginHorizontal: 0,
    shadowColor: 'transparent',
    elevation: 0,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  megaCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.background,
    marginHorizontal: 16,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoutButtonText: {
    color: Colors.textWhite,
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
});

export default UserProfileScreen;
