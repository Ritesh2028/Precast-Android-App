/**
 * Theme runtime: follows the device light/dark setting.
 *
 * - `Colors` / `BWTheme` are live objects: their values are swapped in place
 *   when the device scheme changes, so `Colors.x` read during render is always
 *   current.
 * - `themedStyles(() => ({...}))` replaces module-level `StyleSheet.create`.
 *   The factory runs lazily, once per scheme, and `styles.x` always returns the
 *   current scheme's style. Hard-coded literals in the factory are converted for
 *   dark mode by role (see colorTransform.js); Colors.* tokens use palettes.js.
 * - ThemeProvider (ThemeProvider.js) remounts the tree on change so every
 *   component, memo and cached value re-reads the new theme.
 */
import { Appearance, StyleSheet } from 'react-native';
import { lightPalette, darkPalette, buildBWTheme } from './palettes';
import { toDarkColor, roleForProp } from './colorTransform';

/* global __DEV__ */
if (__DEV__) {
  const lk = Object.keys(lightPalette).sort().join();
  const dk = Object.keys(darkPalette).sort().join();
  if (lk !== dk) console.error('[theme] lightPalette and darkPalette keys differ');
}

const PALETTES = { light: lightPalette, dark: darkPalette };

const normalizeScheme = (s) => (s === 'dark' ? 'dark' : 'light');

let scheme = normalizeScheme(Appearance.getColorScheme());
const listeners = new Set();

/** Live palette. Never reassign; values are replaced in place. */
export const Colors = { ...PALETTES[scheme] };
/** Live derived tokens for manager/detail screens. */
export const BWTheme = buildBWTheme(Colors, scheme === 'dark');

const applyPalette = (s) => {
  Object.assign(Colors, PALETTES[s]);
  Object.assign(BWTheme, buildBWTheme(PALETTES[s], s === 'dark'));
};

export const getScheme = () => scheme;
export const isDarkScheme = () => scheme === 'dark';

export const setScheme = (next) => {
  const s = normalizeScheme(next);
  if (s === scheme) return;
  scheme = s;
  applyPalette(s);
  listeners.forEach((l) => {
    try {
      l(s);
    } catch (e) {
      console.warn('[theme] listener failed', e?.message);
    }
  });
};

export const subscribeScheme = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

Appearance.addChangeListener(({ colorScheme }) => setScheme(colorScheme));

/** Runs `fn` with Colors/BWTheme temporarily set to scheme `s`. */
const withPalette = (s, fn) => {
  if (s === scheme) return fn();
  applyPalette(s);
  try {
    return fn();
  } finally {
    applyPalette(scheme);
  }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Builds the dark value from the light and dark factory runs.
 * A leaf that is identical in both runs did not come from the palette (a
 * literal, or a token that is the same in both), so it is converted by role.
 */
const mergeDark = (light, dark, prop, roles) => {
  if (Array.isArray(dark) && Array.isArray(light) && light.length === dark.length) {
    return dark.map((d, i) => mergeDark(light[i], d, prop, roles));
  }
  if (isPlainObject(dark) && isPlainObject(light)) {
    const out = {};
    Object.keys(dark).forEach((k) => {
      out[k] = mergeDark(light[k], dark[k], k, roles);
    });
    return out;
  }
  if (typeof dark === 'string' && dark === light && prop) {
    const role = roleForProp(prop, roles);
    if (role) return toDarkColor(dark, role);
  }
  return dark;
};

const build = (factory, s, roles, finalize) => {
  if (s === 'light') return finalize(withPalette('light', factory));
  const light = withPalette('light', factory);
  const dark = withPalette('dark', factory);
  return finalize(mergeDark(light, dark, null, roles));
};

/**
 * Object whose top-level keys always resolve to the current scheme's value.
 * Supports `obj.key`, `obj[key]`, spread and Object.keys.
 */
const createLive = (factory, roles, finalize) => {
  const cache = {};
  const current = () => {
    if (!cache[scheme]) cache[scheme] = build(factory, scheme, roles, finalize);
    return cache[scheme];
  };
  const live = {};
  Object.keys(current()).forEach((key) => {
    Object.defineProperty(live, key, {
      enumerable: true,
      configurable: false,
      get: () => current()[key],
    });
  });
  return live;
};

const identity = (v) => v;

/** Theme-aware replacement for a module-level `StyleSheet.create({...})`. */
export const themedStyles = (factory, roles) =>
  createLive(factory, roles, (obj) => StyleSheet.create(obj));

/**
 * Theme-aware module-level constant (status maps, shared style fragments).
 * `roles` maps custom keys to color roles, e.g. { fg: 'text', bg: 'bg' }.
 */
export const themed = (factory, roles) => createLive(factory, roles, identity);

/** Theme-aware hard-coded color for use during render: themeColor('#333', 'text'). */
export const themeColor = (lightColor, role) =>
  (scheme === 'dark' ? toDarkColor(lightColor, role) : lightColor);

/** Pick a value per scheme during render. */
export const pick = (lightValue, darkValue) => (scheme === 'dark' ? darkValue : lightValue);
