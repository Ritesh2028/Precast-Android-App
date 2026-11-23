import { useEffect } from 'react';
import { WEB_URL } from '../config/apiConfig';
import { startTokenRefreshService } from './tokenRefreshService';
import { doRefreshToken } from './refreshTokenApi';
import { getTokens } from './tokenManager';
import { validateToken } from './tokenUtils';
import {
  getAccessSnapshot,
  getNavigation,
  getUser,
  loginWithStoredToken,
  logout,
  setAccessSnapshot,
} from './authService';
import { initPushNotifications } from './pushNotifications';

export const APP_SCREEN = {
  DASHBOARD: 'Dashboard',
  STOCK: 'StockManager',
  ERECTION: 'ErectionManager',
  DISPATCH: 'DispatchManager',
  WEB: 'WebView',
};

const STOCK_PERMISSIONS = [
  'ViewStockyardElement',
  'ViewReceivableStockyard',
  'AssignStockyard',
  'StockyardReport',
  'ReceiveAtStockyard',
  'ApproveStockyardReceipt',
];

const ERECTION_PERMISSIONS = [
  'ViewErectionRequest',
  'ErectionRequest',
  'AddErectionRequest',
  'ViewInTransitElement',
  'ViewDeliveredElement',
  'ViewErectionReceivingLog',
  'ViewElementAtErectionSite',
  'ViewNotErectedElement',
];

const DISPATCH_PERMISSIONS = [
  'ViewDispatchApproval',
  'ApproveDispatchApproval',
  'ViewDispatchLog',
  'ViewRequestedDispatchLog',
  'ViewDispatchedElement',
  'DispatchRequest',
  'AddDispatchLog',
];

function normalizePermissionKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '');
}

function normalizeRoleName(roleName) {
  return String(roleName || '').toLowerCase().trim();
}

function isTenantOnlyRole(roleName, roleId) {
  const id = Number(roleId);
  if (id === 1 || id === 2) return true;
  const n = normalizeRoleName(roleName);
  return n === 'superadmin' || n === 'super_admin' || n === 'super admin' || n === 'admin' || n === 'client';
}

function isQaQcRole(roleName) {
  const n = normalizeRoleName(roleName).replace(/_/g, ' ').replace(/-/g, '/');
  return n === 'qa/qc' || n === 'qa qc' || n === 'qa' || n === 'qc';
}

function matchesManagerRole(roleName, keyword) {
  const n = normalizeRoleName(roleName).replace(/_/g, ' ');
  const compact = n.replace(/\s+/g, '');
  if (!n.includes(keyword)) return false;
  return (
    n.includes('manager') ||
    n.includes('managaer') ||
    n.includes('manger') ||
    compact.includes(`${keyword}manager`) ||
    compact.includes(`${keyword}managaer`) ||
    compact.includes(`${keyword}manger`)
  );
}

function permissionKeySet(permissions) {
  const set = new Set();
  for (const name of permissions || []) {
    const key = normalizePermissionKey(name);
    if (key) set.add(key);
  }
  return set;
}

function countMatches(permSet, names) {
  let count = 0;
  for (const name of names) {
    if (permSet.has(normalizePermissionKey(name))) count += 1;
  }
  return count;
}

function pickScreenByRoleName(roleName) {
  if (isQaQcRole(roleName)) return APP_SCREEN.DASHBOARD;
  if (matchesManagerRole(roleName, 'erection')) return APP_SCREEN.ERECTION;
  if (matchesManagerRole(roleName, 'stock')) return APP_SCREEN.STOCK;
  if (matchesManagerRole(roleName, 'dispatch')) return APP_SCREEN.DISPATCH;
  return APP_SCREEN.WEB;
}

/**
 * Native destination from backend RBAC: tenant-only roles use WebView;
 * QC assignment / QA-QC role uses the QC dashboard; otherwise the strongest
 * field-permission group. Role-name aliases are a fallback if navigation fails.
 */
export function resolveNativeScreen({ roleName, roleId, isQc, permissions } = {}) {
  if (isTenantOnlyRole(roleName, roleId)) {
    return APP_SCREEN.WEB;
  }

  if (isQc === true || isQaQcRole(roleName)) {
    return APP_SCREEN.DASHBOARD;
  }

  const permSet = permissionKeySet(permissions);
  if (permSet.size > 0) {
    const groups = [
      { screen: APP_SCREEN.ERECTION, names: ERECTION_PERMISSIONS },
      { screen: APP_SCREEN.STOCK, names: STOCK_PERMISSIONS },
      { screen: APP_SCREEN.DISPATCH, names: DISPATCH_PERMISSIONS },
    ];
    let bestScreen = null;
    let bestCount = 0;
    for (const group of groups) {
      const count = countMatches(permSet, group.names);
      if (count > bestCount) {
        bestCount = count;
        bestScreen = group.screen;
      }
    }
    if (bestCount > 0) return bestScreen;
  }

  return pickScreenByRoleName(roleName);
}

export function replaceAppScreen(navigation, screen) {
  if (!navigation) return;
  if (screen === APP_SCREEN.WEB) {
    navigation.replace(APP_SCREEN.WEB, { url: WEB_URL });
    return;
  }
  navigation.replace(screen);
}

function buildContext({ loginData, navigationData, userPayload } = {}) {
  const user = userPayload?.user && typeof userPayload.user === 'object' ? userPayload.user : userPayload;
  const roleName =
    loginData?.role ||
    loginData?.role_name ||
    navigationData?.role_name ||
    user?.role_name ||
    '';
  const roleId = navigationData?.role_id ?? user?.role_id ?? 0;
  const isQc = loginData?.qc === true;
  const permissions = Array.isArray(navigationData?.permissions) ? navigationData.permissions : [];
  const screen = resolveNativeScreen({ roleName, roleId, isQc, permissions });
  return { roleName, roleId, isQc, permissions, screen };
}

export async function completeLoginAndNavigate(navigation, loginData) {
  startTokenRefreshService();
  const [navigationData, userPayload] = await Promise.all([
    getNavigation().catch(() => null),
    getUser().catch(() => null),
  ]);
  const ctx = buildContext({ loginData, navigationData, userPayload });
  setAccessSnapshot(ctx);
  replaceAppScreen(navigation, ctx.screen);
  initPushNotifications();
  return ctx;
}

export async function loadAccessContext() {
  const existing = getAccessSnapshot();
  if (existing?.screen) {
    initPushNotifications();
    return existing;
  }

  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken && !refreshToken) return null;

  if (!validateToken(accessToken)) {
    if (!refreshToken) {
      await logout().catch(() => undefined);
      return null;
    }
    const refreshed = await doRefreshToken().catch(() => null);
    if (!refreshed?.access_token) {
      await logout().catch(() => undefined);
      return null;
    }
  }

  let loginData = null;
  try {
    loginData = await loginWithStoredToken();
  } catch (error) {
    if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
      await logout().catch(() => undefined);
      return null;
    }
  }

  const [navigationData, userPayload] = await Promise.all([
    getNavigation().catch(() => null),
    getUser().catch(() => null),
  ]);

  if (!loginData && !navigationData && !userPayload) return null;

  const ctx = buildContext({ loginData, navigationData, userPayload });
  setAccessSnapshot(ctx);
  startTokenRefreshService();
  initPushNotifications();
  return ctx;
}

export function useNativeAccessGuard(navigation, allowedScreen) {
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ctx = await loadAccessContext();
        if (!alive || !ctx?.screen) return;
        if (ctx.screen !== allowedScreen) {
          replaceAppScreen(navigation, ctx.screen);
        }
      } catch {
        // Stay; later API calls handle an expired session.
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigation, allowedScreen]);
}
