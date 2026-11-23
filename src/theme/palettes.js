/**
 * Light + dark palettes. Both MUST have exactly the same keys
 * (enforced in runtime.js at startup in dev).
 *
 * Light = web "Industrial Precision" + accent-blue (PreacastEzy-Frontend/src/index.css :root).
 * Dark  = web `.dark` + `.dark.accent-blue` from the same file, so mobile matches web.
 */

export const lightPalette = {
  // Surfaces
  background: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#F5F5F5',
  muted: '#F5F5F5',
  secondary: '#F5F5F5',
  input: '#EBEBEB',

  // Brand
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
  inputBorder: '#EEF3FC',
  divider: '#E4E4E4',
  ring: '#2D69D2',
  overlay: 'rgba(22, 31, 50, 0.55)',

  // Sidebar / nav wash
  sidebar: '#F1F5FE',
  sidebarAccent: '#E1E8F6',
  sidebarForeground: '#161F32',
  headerBorder: '#D1D8E5',

  // Status
  success: '#22C55E',
  successSoft: '#E8F5E9',
  warning: '#F59E0B',
  warningSoft: '#FFF3E0',
  error: '#EF4444',
  errorSoft: '#FFEBEE',
  destructive: '#D40C18',
  info: '#38BDF8',

  // Chart
  chartPending: '#F59E0B',
  chartCompleted: '#22C55E',
  chartTrack: '#E8EEF5',

  // Shadows
  shadow: 'rgba(6, 22, 58, 0.12)',
  shadowPrimary: 'rgba(45, 105, 210, 0.28)',
};

export const darkPalette = {
  // Surfaces — web .dark: background #1e1e1e, card #252526, muted #2a2d2e, input #3c3c3c
  background: '#1E1E1E',
  card: '#252526',
  surface: '#1A1A1A',
  muted: '#2A2D2E',
  secondary: '#2A2D2E',
  input: '#2F3031',

  // Brand — web .dark.accent-blue primary oklch(0.62 0.18 260)
  brandNavy: '#0B1A3F',
  brandNavyLifted: '#132552',
  brandBlue: '#4C8BF5',
  primary: '#4C8BF5',
  primaryDark: '#3A72D6',
  primaryLight: '#7FAAF8',
  primaryForeground: '#FAFAFA',
  primarySoft: '#1C2635',
  accent: '#1C2635',
  accentForeground: '#C9DBFB',

  // Text — web .dark foreground #d4d4d4, muted-foreground #9d9d9d
  textPrimary: '#E2E2E2',
  textSecondary: '#A3A3A3',
  textLight: '#A3A3A3',
  textMuted: '#9D9D9D',
  textWhite: '#FFFFFF',
  textDark: '#E2E2E2',
  textOnNavy: '#F1F5F9',

  // Chrome
  border: '#3C3C3C',
  borderStrong: '#4A4D52',
  inputBorder: '#3C3C3C',
  divider: '#333333',
  ring: '#4C8BF5',
  overlay: 'rgba(0, 0, 0, 0.65)',

  // Sidebar / nav wash — web .dark sidebar #181818, accent #37373d
  sidebar: '#181818',
  sidebarAccent: '#37373D',
  sidebarForeground: '#D4D4D4',
  headerBorder: '#2B2B2B',

  // Status — same hues, soft fills become dark tints
  success: '#22C55E',
  successSoft: '#16301F',
  warning: '#F59E0B',
  warningSoft: '#3A2A10',
  error: '#F87171',
  errorSoft: '#3B1A1C',
  destructive: '#E5484D',
  info: '#38BDF8',

  // Chart
  chartPending: '#F59E0B',
  chartCompleted: '#22C55E',
  chartTrack: '#33383F',

  // Shadows
  shadow: 'rgba(0, 0, 0, 0.5)',
  shadowPrimary: 'rgba(76, 139, 245, 0.35)',
};

/** Derived manager/detail-screen tokens (was BWTheme). */
export const buildBWTheme = (c, isDark) => ({
  background: c.background,
  card: isDark ? '#252526' : '#FAFAFA',
  surface: c.surface,
  textPrimary: c.textPrimary,
  textSecondary: isDark ? '#B5B5B5' : '#4A4A4A',
  textTertiary: isDark ? '#8A8A8A' : '#808080',
  border: c.border,
  borderLight: isDark ? '#4A4A4A' : '#D0D0D0',
  divider: c.divider,
  accent: c.primary,
  shadow: c.shadow,
});
