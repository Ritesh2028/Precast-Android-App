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
import { themedStyles, useColorSchemeLive } from '../theme';
import Constants from 'expo-constants';
import { Card, Icon } from '../components/ui';
import { AuthImage } from '../components/qc/qcShared';
import { WorkspaceSheet, WORKSPACE_META, currentWorkspace } from '../components/WorkspaceSwitcher';
import { hasMultipleWorkspaces } from '../services/appAccess';
import { getAccessSnapshot } from '../services/authService';

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
  const [workspaceSheetVisible, setWorkspaceSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const scheme = useColorSchemeLive();

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

  const fullName = [userInfo.first_name, userInfo.last_name].filter(Boolean).join(' ') || 'User';
  const initials = `${userInfo.first_name?.[0] || ''}${userInfo.last_name?.[0] || ''}`.toUpperCase() || 'U';
  const joined =
    userInfo.created_at && !String(userInfo.created_at).startsWith('0001-')
      ? new Date(userInfo.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
  const ctx = getAccessSnapshot();
  const multiWorkspace = hasMultipleWorkspaces(ctx);
  const workspaceLabel = WORKSPACE_META[currentWorkspace(navigation)]?.label;
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const details = [
    { icon: 'phone', label: 'Phone', value: [userInfo.phone_code_name, userInfo.phone_no].filter(Boolean).join(' ') },
    { icon: 'map-pin', label: 'Address', value: [userInfo.address, userInfo.city].filter(Boolean).join(', ') },
    { icon: 'building', label: 'Region', value: [userInfo.state, userInfo.country].filter(Boolean).join(', ') },
    { icon: 'hash', label: 'Zip code', value: userInfo.zip_code },
    { icon: 'calendar', label: 'Member since', value: joined },
  ];

  if (loading) {
    return (
      <View style={[styles.mainContainer, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your profile…</Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity */}
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            {userInfo.profile_picture && !imageError ? (
              <AuthImage fileName={userInfo.profile_picture} style={styles.avatar} onError={() => setImageError(true)} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
          {!!userInfo.email && (
            <View style={styles.emailRow}>
              <Icon name="mail" size={14} color="#AFC3EA" />
              <Text style={styles.email} numberOfLines={1}>{userInfo.email}</Text>
            </View>
          )}
          <View style={styles.heroChips}>
            {!!userInfo.role_name && (
              <View style={styles.roleChip}>
                <Icon name="shield-check" size={13} color="#FFFFFF" />
                <Text style={styles.roleChipText}>{userInfo.role_name}</Text>
              </View>
            )}
            {!!userInfo.employee_id && (
              <View style={styles.heroChipMuted}>
                <Text style={styles.heroChipMutedText}>ID {userInfo.employee_id}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Contact & details */}
        <Text style={styles.sectionLabel}>Details</Text>
        <Card style={styles.listCard}>
          {details.map((row, i) => (
            <View key={row.label} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Icon name={row.icon} size={17} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={[styles.rowValue, !row.value && styles.rowValueEmpty]} numberOfLines={2}>
                  {row.value || 'Not added'}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <Card style={styles.listCard}>
          <ActionRow
            icon="lock"
            title="Change password"
            subtitle="We'll email you a secure reset link"
            onPress={handleChangePassword}
            expanded={showChangePassword}
          />
          {showChangePassword && (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.inlineInput}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={changeEmail}
                onChangeText={setChangeEmail}
                returnKeyType="send"
                onSubmitEditing={handleSendResetLink}
              />
              <TouchableOpacity style={styles.inlineButton} onPress={handleSendResetLink} activeOpacity={0.85}>
                <Text style={styles.inlineButtonText}>Send link</Text>
              </TouchableOpacity>
            </View>
          )}
          {multiWorkspace && (
            <ActionRow
              icon="arrow-left-right"
              title="Switch workspace"
              subtitle={workspaceLabel ? `Now in ${workspaceLabel}` : 'Open another area you work in'}
              onPress={() => setWorkspaceSheetVisible(true)}
              border
            />
          )}
          <ActionRow
            icon="moon"
            title="Appearance"
            subtitle={`Follows your phone · ${scheme === 'dark' ? 'Dark' : 'Light'} now`}
            border
          />
          <ActionRow icon="settings" title="Settings" subtitle="App preferences" onPress={handleSettings} border />
        </Card>

        <TouchableOpacity style={styles.logout} onPress={handleLogout} activeOpacity={0.85} accessibilityRole="button">
          <Icon name="log-out" size={18} color={Colors.destructive} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>PrecastEzy · v{appVersion}</Text>
      </ScrollView>

      <WorkspaceSheet visible={workspaceSheetVisible} onClose={() => setWorkspaceSheetVisible(false)} navigation={navigation} />

      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScanned}
        navigation={navigation}
      />

      {!hideBottomNav && <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />}
    </View>
  );
};

/** One tappable account row (no chevron when there is no action). */
const ActionRow = ({ icon, title, subtitle, onPress, border, expanded }) => (
  <TouchableOpacity
    style={[styles.row, border && styles.rowBorder]}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={0.7}
    accessibilityRole={onPress ? 'button' : undefined}
  >
    <View style={styles.rowIcon}>
      <Icon name={icon} size={17} color={Colors.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.rowLabel}>{subtitle}</Text>}
    </View>
    {!!onPress && <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={18} color={Colors.textMuted} />}
  </TouchableOpacity>
);

const styles = themedStyles(() => ({
  mainContainer: { flex: 1, backgroundColor: Colors.surface },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: FontSizes.regular, color: Colors.textSecondary },
  hero: {
    alignItems: 'center',
    backgroundColor: Colors.brandNavy,
    borderRadius: Theme.radiusLg,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { backgroundColor: Colors.brandBlue, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 30, fontWeight: FontWeights.bold, color: '#FFFFFF', letterSpacing: 1 },
  name: { marginTop: 12, fontSize: FontSizes.large + 2, fontWeight: FontWeights.bold, color: Colors.textOnNavy },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, maxWidth: '100%' },
  email: { fontSize: FontSizes.regular, color: '#AFC3EA', flexShrink: 1 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.brandBlue,
  },
  roleChipText: { fontSize: FontSizes.small + 1, fontWeight: FontWeights.semiBold, color: '#FFFFFF' },
  heroChipMuted: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  heroChipMutedText: { fontSize: FontSizes.small + 1, fontWeight: FontWeights.medium, color: '#D5E1F7' },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  listCard: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: FontSizes.small, color: Colors.textSecondary },
  rowValue: { fontSize: FontSizes.regular + 1, color: Colors.textPrimary, fontWeight: FontWeights.medium, marginTop: 1 },
  rowValueEmpty: { color: Colors.textMuted, fontWeight: FontWeights.regular },
  rowTitle: { fontSize: FontSizes.regular + 1, color: Colors.textPrimary, fontWeight: FontWeights.semiBold },
  inlineForm: { flexDirection: 'row', gap: 8, paddingBottom: 14, paddingLeft: 48 },
  inlineInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius,
    paddingHorizontal: 12,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  inlineButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: Theme.radius,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButtonText: { fontSize: FontSizes.button, fontWeight: FontWeights.bold, color: Colors.primaryForeground },
  logout: {
    marginTop: 24,
    height: 50,
    borderRadius: Theme.radius,
    borderWidth: 1.5,
    borderColor: Colors.destructive,
    backgroundColor: Colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { fontSize: FontSizes.button + 1, fontWeight: FontWeights.bold, color: Colors.destructive },
  version: { marginTop: 16, textAlign: 'center', fontSize: FontSizes.small, color: Colors.textMuted },
}));

export default UserProfileScreen;
