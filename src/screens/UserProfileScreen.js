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
import BottomNavigation from '../components/BottomNavigation';
import CameraQRScanner from '../components/CameraQRScanner';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors, Theme } from '../styles/colors';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { logout } from '../services/authService';
import { getTokens } from '../services/tokenManager';
import { validateToken } from '../services/tokenUtils';
import { handle401Error } from '../services/errorHandler';

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

  const applyUserPayload = (payload) => {
    // /api/get_user returns { user, capabilities, impersonation }
    const user = payload?.user && typeof payload.user === 'object' ? payload.user : payload;
    if (!user || typeof user !== 'object') return;
    setUserInfo((prev) => ({
      ...prev,
      ...user,
      phone_code_name: user.phone_code_name || prev.phone_code_name || '',
    }));
    setImageError(false);
  };

  const loadUserData = async (showFullLoader = true) => {
    try {
      if (showFullLoader) setLoading(true);
      const { accessToken } = await getTokens();

      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to access your profile.');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      if (!validateToken(accessToken)) {
        const shouldContinue = await handle401Error(null, null, navigation);
        if (!shouldContinue) return;
      }

      const apiUrl = `${API_BASE_URL}/api/get_user`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: createAuthHeaders(accessToken),
      });

      if (response.ok) {
        applyUserPayload(await response.json());
        return;
      }

      if (response.status === 401) {
        const shouldRetry = await handle401Error(response, null, navigation);
        if (!shouldRetry) {
          Alert.alert('Error', 'Failed to load user data. Please try again.');
        }
        return;
      }

      Alert.alert('Error', `Failed to load user data. Status: ${response.status}`);
    } catch (error) {
      Alert.alert(
        'Network Error',
        'Failed to load user data. Please check your internet connection and try again.'
      );
    } finally {
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
      // Clear stored tokens and stop token refresh service
      await logout();
      
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
    setChangeEmail((prev) => prev || userInfo.email || '');
    setShowChangePassword((prev) => !prev);
  };

  const handleSendResetLink = async () => {
    if (!changeEmail.trim()) {
      Alert.alert('Required', 'Please enter your email address.');
      return;
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: changeEmail.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        Alert.alert('Error', data?.message || data?.error || 'Could not send the reset link.');
        return;
      }
      Alert.alert(
        'Email sent',
        data?.message || 'If this email is registered, a reset link has been sent.'
      );
      setShowChangePassword(false);
      setChangeEmail('');
    } catch {
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
        <ActivityIndicator size="large" color={Colors.primary} />
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
            tintColor={Colors.primary}
            colors={[Colors.primary]}
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
                source={{ uri: `${API_BASE_URL}/api/get-file?file=${userInfo.profile_picture}` }}
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
              <Text style={styles.infoValue}>
                {[userInfo.phone_code_name, userInfo.phone_no].filter(Boolean).join(' ') || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/location.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>
                {[userInfo.address, userInfo.city].filter(Boolean).join(', ') || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/map.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>
                {[userInfo.state, userInfo.country].filter(Boolean).join(', ') || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/zip-code.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Zip Code</Text>
              <Text style={styles.infoValue}>{userInfo.zip_code || '—'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Image source={require('../icons/calendar.png')} style={styles.iconImg} resizeMode="contain" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Join Date</Text>
              <Text style={styles.infoValue}>
                {userInfo.created_at && !String(userInfo.created_at).startsWith('0001-')
                  ? new Date(userInfo.created_at).toLocaleDateString()
                  : 'N/A'}
              </Text>
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
    backgroundColor: Colors.warning,
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
    backgroundColor: Colors.success,
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
    borderColor: Colors.border,
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
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.destructive,
    paddingVertical: 16,
    borderRadius: Theme.radius,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.destructive,
    shadowColor: Colors.brandNavy,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutButtonText: {
    color: Colors.primaryForeground,
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.semiBold,
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
