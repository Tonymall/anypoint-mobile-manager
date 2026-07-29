import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';

// ═══════════════════════════════════════════════════════════════════
// MuleOps Design System — 2026 Dark-First Theme
//
// Design principles:
//   - Deep layered surfaces with subtle blue-tinted contrast
//   - Vibrant accent colors that pop against dark backgrounds
//   - Large bold metrics with small muted labels
//   - Generous spacing and rounded corners (16-20px)
//   - Glass-like card borders with opacity
//   - Monospace for technical values, system font for UI
// ═══════════════════════════════════════════════════════════════════

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontSize: 57, lineHeight: 64, letterSpacing: -0.25 },
  displayMedium: { fontFamily: 'System', fontSize: 45, lineHeight: 52, letterSpacing: 0 },
  displaySmall: { fontFamily: 'System', fontSize: 36, lineHeight: 44, letterSpacing: 0 },
  headlineLarge: { fontFamily: 'System', fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  headlineMedium: { fontFamily: 'System', fontSize: 28, lineHeight: 36, letterSpacing: -0.3 },
  headlineSmall: { fontFamily: 'System', fontSize: 24, lineHeight: 32, letterSpacing: -0.2 },
  titleLarge: { fontFamily: 'System', fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  titleMedium: { fontFamily: 'System', fontSize: 16, lineHeight: 24, letterSpacing: 0.1, fontWeight: '600' as const },
  titleSmall: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600' as const },
  bodyLarge: { fontFamily: 'System', fontSize: 16, lineHeight: 24, letterSpacing: 0.3 },
  bodyMedium: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.15 },
  bodySmall: { fontFamily: 'System', fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  labelLarge: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '600' as const },
  labelMedium: { fontFamily: 'System', fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontWeight: '600' as const },
  labelSmall: { fontFamily: 'System', fontSize: 11, lineHeight: 16, letterSpacing: 0.4, fontWeight: '500' as const },
};

// MuleSoft / Anypoint brand colors — vibrant against dark
const anypointColors = {
  primary: '#00A1E0',         // MuleSoft blue
  primaryDark: '#0078B8',
  primaryLight: '#4DC9F6',
  secondary: '#818CF8',       // Soft indigo (more vibrant for 2026)
  accent: '#34D399',          // Emerald green (fresher)
  success: '#22C55E',         // Green 500
  warning: '#F59E0B',         // Amber 500
  error: '#EF4444',           // Red 500
  critical: '#DC2626',
  info: '#3B82F6',            // Blue 500
  muleGreen: '#10B981',
  mulePurple: '#A78BFA',      // Violet 400
};

// ── Light Theme ──
export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: '#00A1E0',
    primaryContainer: '#D6F0FF',
    secondary: '#6366F1',
    secondaryContainer: '#E0E7FF',
    tertiary: '#10B981',
    tertiaryContainer: '#D1FAE5',
    error: '#DC2626',
    errorContainer: '#FEE2E2',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F5F9',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#00344D',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#312E81',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#064E3B',
    onBackground: '#0F172A',
    onSurface: '#0F172A',
    onSurfaceVariant: '#64748B',
    outline: '#CBD5E1',
    outlineVariant: '#E2E8F0',
    elevation: {
      level0: 'transparent',
      level1: '#F8FAFC',
      level2: '#F1F5F9',
      level3: '#E2E8F0',
      level4: '#CBD5E1',
      level5: '#94A3B8',
    },
  },
};

// ── Dark Theme (Primary) ──
// Deep space-black with blue-tinted layered surfaces
export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: anypointColors.primary,
    primaryContainer: '#0C3A55',
    secondary: '#A5B4FC',
    secondaryContainer: '#312E81',
    tertiary: '#6EE7B7',
    tertiaryContainer: '#064E3B',
    error: '#FCA5A5',
    errorContainer: '#7F1D1D',
    background: '#0B0F19',           // Deep blue-black
    surface: '#111827',              // Card surface — subtle warmth
    surfaceVariant: '#1E293B',       // Elevated surface / input bg
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#DBEAFE',
    onSecondary: '#1E1B4B',
    onSecondaryContainer: '#E0E7FF',
    onTertiary: '#064E3B',
    onTertiaryContainer: '#D1FAE5',
    onBackground: '#F1F5F9',
    onSurface: '#F1F5F9',
    onSurfaceVariant: '#94A3B8',
    outline: '#334155',
    outlineVariant: '#1E293B',
    inverseSurface: '#F1F5F9',
    inverseOnSurface: '#0B0F19',
    inversePrimary: '#004A6E',
    elevation: {
      level0: 'transparent',
      level1: '#111827',
      level2: '#1E293B',
      level3: '#263548',
      level4: '#2D3F56',
      level5: '#344A64',
    },
  },
};

export const statusColors = {
  started: anypointColors.success,
  stopped: '#6B7280',
  failed: anypointColors.error,
  deploying: anypointColors.warning,
  active: anypointColors.success,
  inactive: '#6B7280',
  deprecated: anypointColors.warning,
  blocked: anypointColors.error,
  running: anypointColors.success,
  disconnected: anypointColors.error,
  pending: anypointColors.warning,
  approved: anypointColors.success,
  rejected: anypointColors.error,
};

export const severityColors = {
  CRITICAL: anypointColors.critical,
  WARNING: anypointColors.warning,
  INFO: anypointColors.info,
};

// ── Design Tokens ──
// Spacing based on 4pt grid system
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Border radius scale
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// Shadow presets (cross-platform)
export const shadows = {
  none: { elevation: 0 },
  sm: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  md: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
} as const;

export { anypointColors };

// ── Design tokens ──
// The semantic layer: screens name roles, not raw values. See tokens.ts.
// `anypointColors`/`statusColors` above remain for not-yet-migrated screens.
export {
  getTokens,
  withAlpha,
  alpha,
  type as typeScale,
  motion,
  monoFontFamily,
  type Tokens,
  type TypeToken,
  type AlphaToken,
  type ColorTokens,
  type StatusRole,
} from './tokens';
export { useTokens } from './useTokens';
