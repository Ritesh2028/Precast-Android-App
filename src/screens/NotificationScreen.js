import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSizes, FontWeights } from '../styles/fonts';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { validateSession, refreshSession } from '../services/authService';
import { handleApiError } from '../services/errorHandler';
import BottomNavigation from '../components/BottomNavigation';

const NotificationScreen = ({ navigation, route, hideBottomNav = false }) => {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeBottomTab, setActiveBottomTab] = useState('home');

  // Fetch notifications
  const fetchNotifications = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const { accessToken } = await getTokens();
      if (!accessToken) {
        setError('Authentication required');
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

      const apiUrl = `${API_BASE_URL}/api/notifications`;
      console.log('📱 [NotificationScreen] Fetching notifications from:', apiUrl);

      // Try with Bearer token first
      let headers = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      let response = await fetch(apiUrl, { headers });

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        headers = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        response = await fetch(apiUrl, { headers });
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [NotificationScreen] Notifications loaded:', data.length);
        setNotifications(Array.isArray(data) ? data : []);
      } else {
        const errorText = await response.text();
        console.error('❌ [NotificationScreen] Error loading notifications:', errorText);
        setError('Failed to load notifications');
        setNotifications([]);
      }
    } catch (error) {
      console.error('❌ [NotificationScreen] Error fetching notifications:', error);
      setError('Network error loading notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

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
      const action = notification.action.replace('https://precast.blueinvent.com', '');
      
      if (action) {
        // Try to navigate based on action
        // For now, just log it - you can add specific navigation logic here
        console.log('📱 [NotificationScreen] Navigation action:', action);
        // You can add specific navigation logic based on action patterns
      }
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return dateString;
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return '✓';
      case 'error':
        return '⚠';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return '#34C759';
      case 'error':
        return '#FF3B30';
      case 'warning':
        return '#FF9500';
      default:
        return '#007AFF';
    }
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
          <ActivityIndicator size="large" color="#007AFF" />
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
            onRefresh={() => fetchNotifications(true)}
            tintColor="#007AFF"
            colors={['#007AFF']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.actionButton, unreadCount === 0 && styles.actionButtonDisabled]}
              onPress={markAllAsRead}
              disabled={unreadCount === 0}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionButtonText, unreadCount === 0 && styles.actionButtonTextDisabled]}>
                Mark all
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => fetchNotifications(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.subtitle}>Stay updated with your tasks and system alerts</Text>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'all' && styles.tabActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'unread' && styles.tabActive]}
            onPress={() => setActiveTab('unread')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>
              Unread
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'read' && styles.tabActive]}
            onPress={() => setActiveTab('read')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'read' && styles.tabTextActive]}>
              Read
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Notifications List */}
        {filteredNotifications.length === 0 && !error ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No notifications found</Text>
            <Text style={styles.emptySubtext}>
              We'll notify you when there's something new
            </Text>
          </View>
        ) : (
          <View style={styles.notificationsList}>
            {filteredNotifications.map((notification) => {
              const isUnread = notification.status === 'unread';
              const statusColor = getStatusColor(notification.status);
              const statusIcon = getStatusIcon(notification.status);

              return (
                <TouchableOpacity
                  key={notification.id}
                  style={[
                    styles.notificationCard,
                    isUnread && styles.notificationCardUnread,
                  ]}
                  onPress={() => handleNotificationClick(notification)}
                  activeOpacity={0.7}
                >
                  <View style={styles.notificationContent}>
                    <View style={[styles.statusIconContainer, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.statusIcon, { color: statusColor }]}>
                        {statusIcon}
                      </Text>
                    </View>
                    <View style={styles.notificationTextContainer}>
                      <View style={styles.notificationHeader}>
                        <Text style={[styles.notificationMessage, isUnread && styles.notificationMessageUnread]}>
                          {notification.message}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                            {notification.status}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.notificationFooter}>
                        <Text style={styles.notificationTime}>
                          🕐 {formatDate(notification.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
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

const BWTheme = {
  background: '#FFFFFF',
  card: '#FAFAFA',
  surface: '#F5F5F5',
  textPrimary: '#000000',
  textSecondary: '#4A4A4A',
  textTertiary: '#808080',
  border: '#E0E0E0',
  divider: '#E0E0E0',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BWTheme.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
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
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 40,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  actionButtonTextDisabled: {
    color: BWTheme.textSecondary,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: FontSizes.medium,
    color: BWTheme.textPrimary,
  },
  subtitle: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: BWTheme.surface,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: FontWeights.bold,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    fontSize: FontSizes.small,
    color: '#C62828',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    textAlign: 'center',
  },
  notificationsList: {
    gap: 12,
  },
  notificationCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationCardUnread: {
    borderColor: '#007AFF',
    borderWidth: 2,
    backgroundColor: '#E3F2FD',
  },
  notificationContent: {
    flexDirection: 'row',
    gap: 12,
  },
  statusIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 20,
    fontWeight: FontWeights.bold,
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  notificationMessage: {
    flex: 1,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
    color: BWTheme.textPrimary,
    lineHeight: 20,
  },
  notificationMessageUnread: {
    fontWeight: FontWeights.bold,
    color: '#007AFF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  notificationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTime: {
    fontSize: FontSizes.extraSmall,
    color: BWTheme.textSecondary,
  },
});

export default NotificationScreen;
