import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

/** First-launch chooser shown to users who can work in more than one area. */
export const WORKSPACE_PICKER = 'Workspaces';

/** Display order of native areas in the chooser / switcher. */
const NATIVE_ORDER = [APP_SCREEN.DASHBOARD, APP_SCREEN.ERECTION, APP_SCREEN.STOCK, APP_SCREEN.DISPATCH];

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

// Permissions that mean the user actually works in an area (not just views it).
// Used only to decide whether to OFFER an extra area to a multi-role user.
const STOCK_ACTIONS = ['AssignStockyard', 'ReceiveAtStockyard', 'ApproveStockyardReceipt'];
const ERECTION_ACTIONS = ['ErectionRequest', 'AddErectionRequest'];
const DISPATCH_ACTIONS = ['ApproveDispatchApproval', 'DispatchRequest', 'AddDispatchLog'];

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

/**
 * Every area this user may open. A user can hold several roles (global role +
 * project_member_roles; /api/navigation returns the union of their permissions)
 * and be a QC assignee at the same time, so more than one area can apply.
 * The primary screen (resolveNativeScreen) is always included; the full web app
 * is offered as an extra whenever the user has more than one place to work.
 */
export function resolveWorkspaces({ roleName, roleId, isQc, permissions } = {}) {
  const primary = resolveNativeScreen({ roleName, roleId, isQc, permissions });
  const permSet = permissionKeySet(permissions);
  const native = new Set();

  if (isTenantOnlyRole(roleName, roleId)) {
    // Admin / client roles carry (almost) every permission, so permissions say
    // nothing here. Only a real QC assignment adds the native QC area.
    if (isQc === true) native.add(APP_SCREEN.DASHBOARD);
  } else {
    if (isQc === true || isQaQcRole(roleName)) native.add(APP_SCREEN.DASHBOARD);
    if (countMatches(permSet, ERECTION_ACTIONS) > 0 || matchesManagerRole(roleName, 'erection')) {
      native.add(APP_SCREEN.ERECTION);
    }
    if (countMatches(permSet, STOCK_ACTIONS) > 0 || matchesManagerRole(roleName, 'stock')) {
      native.add(APP_SCREEN.STOCK);
    }
    if (countMatches(permSet, DISPATCH_ACTIONS) > 0 || matchesManagerRole(roleName, 'dispatch')) {
      native.add(APP_SCREEN.DISPATCH);
    }
  }
  if (primary !== APP_SCREEN.WEB) native.add(primary);

  const list = NATIVE_ORDER.filter((s) => native.has(s));
  const multi = list.length > 1 || (primary === APP_SCREEN.WEB && list.length > 0);
  if (primary === APP_SCREEN.WEB || multi) list.push(APP_SCREEN.WEB);
  return list;
}

export const hasMultipleWorkspaces = (ctx) => Array.isArray(ctx?.workspaces) && ctx.workspaces.length > 1;

export const canOpenWorkspace = (ctx, screen) =>
  !ctx || !Array.isArray(ctx.workspaces) || ctx.workspaces.includes(screen) || ctx.screen === screen;

const lastWorkspaceKey = (ctx) => `workspace.last.${ctx?.userKey || 'default'}`;

/** Remembers the area the user chose so the next launch opens there. */
export async function rememberWorkspace(ctx, screen) {
  if (!ctx) return;
  try {
    await AsyncStorage.setItem(lastWorkspaceKey(ctx), screen);
  } catch {
    // Not critical: the user just gets the chooser / primary screen next time.
  }
}

/**
 * Where to land after login / splash:
 *  - one area only            -> that area (unchanged behaviour)
 *  - several, choice remembered and still allowed -> the remembered area
 *  - several, nothing remembered                  -> the workspace chooser
 */
export async function resolveLanding(ctx) {
  if (!ctx?.screen) return null;
  if (!hasMultipleWorkspaces(ctx)) return ctx.screen;
  try {
    const last = await AsyncStorage.getItem(lastWorkspaceKey(ctx));
    if (last && ctx.workspaces.includes(last)) return last;
  } catch {
    // Fall through to the chooser.
  }
  return WORKSPACE_PICKER;
}

/** Opens an area as the new root (used by the chooser and the switcher). */
export function openWorkspace(navigation, screen) {
  if (!navigation) return;
  const route = screen === APP_SCREEN.WEB ? { name: APP_SCREEN.WEB, params: { url: WEB_URL } } : { name: screen };
  navigation.reset({ index: 0, routes: [route] });
}

export function replaceAppScreen(navigation, screen) {
  if (!navigation) return;
  if (screen === WORKSPACE_PICKER) {
    navigation.replace(WORKSPACE_PICKER);
    return;
  }
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
  const workspaces = resolveWorkspaces({ roleName, roleId, isQc, permissions });
  const userKey = user?.id ?? user?.user_id ?? user?.email ?? null;
  const firstName = user?.first_name || '';
  return { roleName, roleId, isQc, permissions, screen, workspaces, userKey, firstName };
}

export async function completeLoginAndNavigate(navigation, loginData) {
  startTokenRefreshService();
  const [navigationData, userPayload] = await Promise.all([
    getNavigation().catch(() => null),
    getUser().catch(() => null),
  ]);
  const ctx = buildContext({ loginData, navigationData, userPayload });
  setAccessSnapshot(ctx);
  const landing = (await resolveLanding(ctx)) || ctx.screen;
  replaceAppScreen(navigation, landing);
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
        // Multi-role users may open any of their areas; only redirect when this
        // area is genuinely not theirs.
        if (!canOpenWorkspace(ctx, allowedScreen)) {
          const landing = (await resolveLanding(ctx)) || ctx.screen;
          if (alive && landing !== allowedScreen) replaceAppScreen(navigation, landing);
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
