/**
 * PrecastEzy mobile theme — mirrors web "Industrial Precision" + fixed `accent-blue`
 * (PreacastEzy-Frontend/src/index.css + main.tsx: light + accent-blue).
 *
 * Single source of truth for brand, surfaces, status, and chrome.
 * Prefer these tokens over one-off hex in screens/components.
 */
export const Colors = {
  // Surfaces (web light)
  background: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#F5F5F5',
  muted: '#F5F5F5',
  secondary: '#F5F5F5',
  input: '#EBEBEB',

  // Brand (Industrial Precision)
  brandNavy: '#06163A',
  brandNavyLifted: '#0E1F4A',
  brandBlue: '#2D69D2',
  primary: '#2D69D2',
  primaryDark: '#1E4FA8',
  primaryLight: '#4A8AF0',
  primaryForeground: '#FCFCFC',
  primarySoft: '#EEF3FC',
  accent: '#EEF3FC',
  accentForeground: '#1E3A6E',

  // Text
  textPrimary: '#0B0B0B',
  textSecondary: '#636363',
  textLight: '#636363',
  textMuted: '#636363',
  textWhite: '#FFFFFF',
  textDark: '#0B0B0B',
  textOnNavy: '#F1F5F9',

  // Chrome
  border: '#E4E4E4',
  borderStrong: '#D1D8E5',
  divider: '#E4E4E4',
  ring: '#2D69D2',
  overlay: 'rgba(22, 31, 50, 0.55)',

  // Sidebar / nav wash (web light sidebar + blue accent)
  sidebar: '#F1F5FE',
  sidebarAccent: '#E1E8F6',
  sidebarForeground: '#161F32',
  headerBorder: '#D1D8E5',

  // Status (web status families)
  success: '#22C55E',
  successSoft: '#E8F5E9',
  warning: '#F59E0B',
  warningSoft: '#FFF3E0',
  error: '#EF4444',
  errorSoft: '#FFEBEE',
  destructive: '#D40C18',
  info: '#38BDF8',

  // Chart (Tableau-aligned subset used on mobile)
  chartPending: '#F59E0B',
  chartCompleted: '#22C55E',
  chartTrack: '#E8EEF5',

  // Shadows
  shadow: 'rgba(6, 22, 58, 0.12)',
  shadowPrimary: 'rgba(45, 105, 210, 0.28)',
};

/** Web-like control sizing (button.tsx h-9 / radius ~0.625rem). */
export const Theme = {
  radius: 10,
  radiusLg: 12,
  radiusSm: 8,
  buttonHeight: 40,
  buttonHeightSm: 36,
  buttonHeightLg: 44,
  fontButton: 13,
};

/**
 * Shared light theme for manager / detail screens (replaces duplicated BWTheme).
 */
export const BWTheme = {
  background: Colors.background,
  card: '#FAFAFA',
  surface: Colors.surface,
  textPrimary: Colors.textPrimary,
  textSecondary: '#4A4A4A',
  textTertiary: '#808080',
  border: Colors.border,
  borderLight: '#D0D0D0',
  divider: Colors.divider,
  accent: Colors.primary,
  shadow: Colors.shadow,
};

export default Colors;
