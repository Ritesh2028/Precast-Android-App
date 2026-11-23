import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import api from './apiClient';
import { getTokens } from './tokenManager';

// Mirrors PreacastEzy-Frontend/src/utils/pushNotifications.ts: ask permission,
// get this device's FCM token and register it with the backend; remove it on logout.

// The backend sends android.notification.channel_id = "default" (fcm_service.go).
const ANDROID_CHANNEL_ID = 'default';

// Expo Go removed remote push on Android from SDK 53. Skip native push there so
// the app still boots; use a development build for real FCM.
// isRunningInExpoGo() checks for Expo Go's native module, so it is reliable on
// every SDK; the Constants checks are fallbacks only.
const isExpoGo =
  isRunningInExpoGo() ||
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

let initPromise = null;
let tokenSubscription = null;
let responseSubscription = null;
let receivedSubscription = null;
let navigationRef = null;
let pendingData = null;
let registeredToken = null;
const incomingListeners = new Set();

// Backend link.Screen values (internal/notify/rules.go) mapped onto screens this app has.
const SCREEN_ROUTES = {
  ErectionRequest: 'ErectionManager',
  ErectionElements: 'ErectionManager',
  ElementStockyard: 'StockManager',
  DispatchLog: 'DispatchManager',
  ProjectDashboard: 'Dashboard',
  ProjectPlan: 'Dashboard',
  Projects: 'Dashboard',
};

export const setPushNavigation = (ref) => {
  navigationRef = ref;
  if (ref && pendingData) {
    const data = pendingData;
    pendingData = null;
    openNotificationTarget(data);
  }
};

if (!isExpoGo) {
  // Show pushes that arrive while the app is open (the web app shows a toast).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Backend accepts android | ios | web (NotificationHandlers.devicePlatform).
const pushPlatform = () => {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
};

const registerTokenWithBackend = async (token) => {
  registeredToken = token;
  await api.post('/api/fcm/register-token', { token, platform: pushPlatform() });
};

const notificationData = (response) => response?.notification?.request?.content?.data || null;

// Screens subscribe so an open list can reload when FCM delivers a message.
export const subscribeToIncomingPush = (listener) => {
  incomingListeners.add(listener);
  return () => incomingListeners.delete(listener);
};

const emitIncomingPush = (data) => {
  incomingListeners.forEach((listener) => {
    try {
      listener(data);
    } catch (error) {
      console.warn('Push listener failed:', error?.message);
    }
  });
};

export const openNotificationTarget = (data) => {
  if (!data) return;
  if (!navigationRef?.isReady?.()) {
    pendingData = data;
    return;
  }
  const route = SCREEN_ROUTES[data.screen] || 'Notifications';
  const projectId = Number(data.project_id);
  navigationRef.navigate(route, {
    projectId: Number.isFinite(projectId) && projectId > 0 ? projectId : undefined,
    notificationId: data.notification_id,
    eventType: data.event_type,
  });
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  // A channel failure must not block permission/token registration: the backend
  // channel id falls back to the plugin's "default" channel from app.json.
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'PrecastEzy',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (error) {
    console.warn('Could not create Android notification channel:', error?.message);
  }
};

export const initPushNotifications = async () => {
  if (isExpoGo) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const { accessToken } = await getTokens();
    if (!accessToken) {
      initPromise = null;
      return;
    }

    // The channel must exist before Android 13+ shows the permission prompt.
    await ensureAndroidChannel();

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      // iOS needs alert/sound/badge options; Android uses the same call after the channel exists.
      ({ status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      }));
    }
    if (status !== 'granted') {
      return;
    }

    // Native FCM/APNs device token (not Expo's push token) — backend sends via FCM HTTP v1.
    const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
    if (fcmToken) {
      await registerTokenWithBackend(fcmToken);
    }

    if (!tokenSubscription) {
      tokenSubscription = Notifications.addPushTokenListener(({ data }) => {
        if (data) {
          registerTokenWithBackend(data).catch((error) => {
            console.warn('Failed to re-register push token:', error?.message);
          });
        }
      });
    }

    if (!responseSubscription) {
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        openNotificationTarget(notificationData(response));
      });
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) openNotificationTarget(notificationData(last));
    }

    // Fires while the app is open. Background delivery is picked up on resume.
    if (!receivedSubscription) {
      receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        emitIncomingPush(notification?.request?.content?.data || null);
      });
    }
  })().catch((error) => {
    console.warn('Failed to initialize push notifications:', error?.message);
    initPromise = null;
  });

  return initPromise;
};

/** Call while the session is still valid (before tokens are cleared). */
export const removePushNotifications = async () => {
  tokenSubscription?.remove();
  tokenSubscription = null;
  responseSubscription?.remove();
  responseSubscription = null;
  receivedSubscription?.remove();
  receivedSubscription = null;
  incomingListeners.clear();
  initPromise = null;
  const token = registeredToken;
  registeredToken = null;
  try {
    await api.delete('/api/fcm/remove-token', { data: token ? { token } : {} });
  } catch {
    // Ignore logout cleanup failures
  }
};
