import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSizes, FontWeights } from '../styles/fonts';
import { API_BASE_URL, WEB_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { validateSession, refreshSession } from '../services/authService';
import BottomNavigation from '../components/BottomNavigation';
import { Colors, BWTheme } from '../styles/colors';
import { subscribeToIncomingPush } from '../services/pushNotifications';

const KIND_META = {
  project: { label: 'Project', icon: 'P', bg: '#E8F0FE', fg: '#1A56DB' },
  drawing: { label: 'Drawing', icon: 'D', bg: '#F3E8FF', fg: '#7C3AED' },
  dispatch: { label: 'Dispatch', icon: 'S', bg: '#FEF3C7', fg: '#D97706' },
  erection: { label: 'Erection', icon: 'E', bg: '#FFEDD5', fg: '#EA580C' },
  qc: { label: 'Quality', icon: 'Q', bg: '#D1FAE5', fg: '#059669' },
  inventory: { label: 'Stock', icon: 'I', bg: '#CFFAFE', fg: '#0891B2' },
  production: { label: 'Production', icon: 'W', bg: '#E0E7FF', fg: '#4F46E5' },
  team: { label: 'Team', icon: 'T', bg: '#FCE7F3', fg: '#DB2777' },
  chat: { label: 'Message', icon: 'M', bg: '#E0F2FE', fg: '#0284C7' },
  general: { label: 'Update', icon: 'N', bg: '#F1F3F4', fg: '#5F6368' },
};

const TIME_GROUPS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'earlier', label: 'Earlier' },
];

function classifyNotification(message, action) {
  const hay = `${message || ''} ${action || ''}`.toLowerCase();
  if (/drawing|revision/.test(hay)) return 'drawing';
  if (/dispatch|shipment|truck/.test(hay)) return 'dispatch';
  if (/erect|errect/.test(hay)) return 'erection';
  if (/\bqc\b|quality|checklist|inspection/.test(hay)) return 'qc';
  if (/stock|warehouse|stockyard|inventory/.test(hay)) return 'inventory';
  if (/bom|wip|production|cast|element type/.test(hay)) return 'production';
  if (/mention|chat|message/.test(hay)) return 'chat';
  if (/user |people|member|role/.test(hay)) return 'team';
  if (/project|milestone|task/.test(hay)) return 'project';
  return 'general';
}

function getTimeGroup(date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  if (date >= startOfToday) return 'today';
  if (date >= startOfYesterday) return 'yesterday';
  if (date >= startOfWeek) return 'week';
  return 'earlier';
}

function groupByTime(items) {
  const buckets = { today: [], yesterday: [], week: [], earlier: [] };
  items.forEach((item) => {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) {
      buckets.earlier.push(item);
      return;
    }
    buckets[getTimeGroup(date)].push(item);
  });
  return TIME_GROUPS.filter((group) => buckets[group.key].length > 0).map((group) => ({
    ...group,
    items: buckets[group.key],
  }));
}

const NotificationScreen = ({ navigation, route, hideBottomNav = false }) => {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // all | unread
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeBottomTab, setActiveBottomTab] = useState('home');
  const requestId = useRef(0);
  const hasLoaded = useRef(false);

  // mode: 'initial' shows the loader, 'refresh' shows pull-to-refresh, 'silent' updates in place.
  const fetchNotifications = useCallback(async (mode = 'initial') => {
    const silent = mode === 'silent';
    const id = ++requestId.current;
    try {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      }
      if (!silent) setError(null);

      const { accessToken } = await getTokens();
      if (!accessToken) {
        if (!silent) setError('Authentication required');
        return;
      }

      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch {
        // Keep the stored token and let the request fail if it is stale.
      }

      const apiUrl = `${API_BASE_URL}/api/notifications`;
      let headers = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      let response = await fetch(apiUrl, { headers });

      if (response.status === 401) {
        headers = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        response = await fetch(apiUrl, { headers });
      }

      if (id !== requestId.current) return;

      if (response.ok) {
        const data = await response.json();
        hasLoaded.current = true;
        setNotifications(Array.isArray(data) ? data : []);
        setError(null);
      } else if (!silent) {
        setError('Failed to load notifications');
        setNotifications([]);
      }
    } catch {
      if (id !== requestId.current) return;
      if (!silent) {
        setError('Network error loading notifications');
        setNotifications([]);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications(hasLoaded.current ? 'silent' : 'initial');

      const unsubscribePush = subscribeToIncomingPush(() => {
        fetchNotifications('silent');
      });
      const appStateSub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') fetchNotifications('silent');
      });

      return () => {
        unsubscribePush();
        appStateSub.remove();
      };
    }, [fetchNotifications]),
  );

  // Calculate unread count
  useEffect(() => {
    const unread = notifications.filter((n) => n.status === 'unread').length;
    setUnreadCount(unread);
  }, [notifications]);

  // Filter notifications by tab
  useEffect(() => {
    let filtered = notifications;

    if (activeTab !== 'all') {
      filtered = filtered.filter((n) => n.status.toLowerCase() === activeTab);
    }

    setFilteredNotifications(filtered);
  }, [notifications, activeTab]);

  const groupedNotifications = groupByTime(filteredNotifications);

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Error', 'Authentication required');
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [NotificationScreen] Session validation failed');
      }

      const apiUrl = `${API_BASE_URL}/api/notifications/read-all`;
      let headers = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      let response = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({}),
      });

      if (response.status === 401) {
        headers = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        response = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({}),
        });
      }

      if (response.ok) {
        // Optimistically update local state
        setNotifications((prev) =>
          prev.map((notification) => ({ ...notification, status: 'read' }))
        );
      } else {
        Alert.alert('Error', 'Failed to mark all notifications as read');
      }
    } catch (error) {
      console.error('❌ [NotificationScreen] Error marking all as read:', error);
      Alert.alert('Error', 'Failed to mark all notifications as read');
    }
  };

  // Mark single notification as read
  const markNotificationAsRead = async (notificationId) => {
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) return;

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [NotificationScreen] Session validation failed');
      }

      const apiUrl = `${API_BASE_URL}/api/notifications/${notificationId}/read`;
      let headers = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      let response = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({}),
      });

      if (response.status === 401) {
        headers = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        response = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({}),
        });
      }

      if (response.ok) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, status: 'read' } : n))
        );
      }
    } catch (error) {
      console.error('❌ [NotificationScreen] Error marking notification as read:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    // Mark as read if unread
    if (notification.status === 'unread') {
      await markNotificationAsRead(notification.id);
    }

    // Handle navigation if action exists
    if (notification.action) {
      // Remove base URL from action
      const action = notification.action
        .replace(WEB_URL.replace(/\/$/, ''), '')
        .replace(API_BASE_URL, '');
      
      if (action) {
        // Try to navigate based on action
        // For now, just log it - you can add specific navigation logic here
        console.log('📱 [NotificationScreen] Navigation action:', action);
        // You can add specific navigation logic based on action patterns
      }
    }
  };

  const formatRelativeTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleTabPress = useCallback((tabId, screenName) => {
    setActiveBottomTab(tabId);
    const state = navigation.getState?.();
    const currentRoute = state?.routes?.[state?.index || 0]?.name;
    
    if (tabId === 'home') {
      if (currentRoute !== 'Dashboard') {
        navigation.navigate('Dashboard');
      }
    } else if (tabId === 'task') {
      if (currentRoute !== 'QCStatus') {
        navigation.navigate('QCStatus');
      }
    } else if (tabId === 'me') {
      if (currentRoute !== 'UserProfile') {
        navigation.navigate('UserProfile');
      }
    }
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
        {!hideBottomNav && (
          <BottomNavigation
            activeTab={activeBottomTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchNotifications('refresh')}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.headerSubtitle}>{unreadCount} new</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={unreadCount === 0}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.markAllText,
                unreadCount === 0 && styles.markAllTextDisabled,
              ]}
            >
              Mark all read
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, activeTab === 'all' && styles.chipActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, activeTab === 'all' && styles.chipTextActive]}>
              All {notifications.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, activeTab === 'unread' && styles.chipActive]}
            onPress={() => setActiveTab('unread')}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, activeTab === 'unread' && styles.chipTextActive]}>
              Unread {unreadCount}
            </Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {filteredNotifications.length === 0 && !error ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>🔔</Text>
            </View>
            <Text style={styles.emptyText}>
              {activeTab === 'unread' && notifications.length > 0
                ? 'No unread notifications'
                : "You're all caught up"}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'unread' && notifications.length > 0
                ? 'Switch to All to see earlier updates'
                : "We'll let you know when something new happens"}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {groupedNotifications.map((group) => (
              <View key={group.key}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {group.items.map((notification) => {
                  const isUnread = notification.status === 'unread';
                  const kind = classifyNotification(
                    notification.message,
                    notification.action,
                  );
                  const meta = KIND_META[kind];

                  return (
                    <TouchableOpacity
                      key={notification.id}
                      style={[styles.row, isUnread && styles.rowUnread]}
                      onPress={() => handleNotificationClick(notification)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.kindIcon, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.kindIconText, { color: meta.fg }]}>
                          {meta.icon}
                        </Text>
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          style={[styles.rowMessage, isUnread && styles.rowMessageUnread]}
                          numberOfLines={2}
                        >
                          {notification.message}
                        </Text>
                        <Text style={styles.rowKind}>{meta.label}</Text>
                      </View>
                      <View style={styles.rowMeta}>
                        <Text style={[styles.rowTime, isUnread && styles.rowTimeUnread]}>
                          {formatRelativeTime(notification.created_at)}
                        </Text>
                        {isUnread ? <View style={styles.unreadDot} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {!hideBottomNav && (
        <BottomNavigation
          activeTab={activeBottomTab}
          onTabPress={handleTabPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F3F4',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 60,
  },
  loadingText: {
    marginTop: 20,
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: FontWeights.bold,
    color: '#202124',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#5F6368',
  },
  markAllText: {
    fontSize: 13,
    fontWeight: FontWeights.medium,
    color: Colors.primary,
    paddingVertical: 4,
  },
  markAllTextDisabled: {
    color: '#9AA0A6',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: FontWeights.medium,
    color: '#5F6368',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeights.bold,
  },
  errorContainer: {
    backgroundColor: Colors.errorSoft,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: FontSizes.small,
    color: '#C62828',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
    paddingHorizontal: 24,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: FontWeights.bold,
    color: '#202124',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#5F6368',
    textAlign: 'center',
    maxWidth: 240,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: '#5F6368',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EAED',
  },
  rowUnread: {
    backgroundColor: '#E8F0FE',
  },
  kindIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  kindIconText: {
    fontSize: 15,
    fontWeight: FontWeights.bold,
  },
  rowBody: {
    flex: 1,
  },
  rowMessage: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: FontWeights.medium,
    color: '#3C4043',
  },
  rowMessageUnread: {
    fontWeight: FontWeights.bold,
    color: '#202124',
  },
  rowKind: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F6368',
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 2,
  },
  rowTime: {
    fontSize: 11,
    color: '#5F6368',
  },
  rowTimeUnread: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});

export default NotificationScreen;
