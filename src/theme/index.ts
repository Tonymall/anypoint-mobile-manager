import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontSize: 57, lineHeight: 64, letterSpacing: -0.25 },
  displayMedium: { fontFamily: 'System', fontSize: 45, lineHeight: 52, letterSpacing: 0 },
  displaySmall: { fontFamily: 'System', fontSize: 36, lineHeight: 44, letterSpacing: 0 },
  headlineLarge: { fontFamily: 'System', fontSize: 32, lineHeight: 40, letterSpacing: 0 },
  headlineMedium: { fontFamily: 'System', fontSize: 28, lineHeight: 36, letterSpacing: 0 },
  headlineSmall: { fontFamily: 'System', fontSize: 24, lineHeight: 32, letterSpacing: 0 },
  titleLarge: { fontFamily: 'System', fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  titleMedium: { fontFamily: 'System', fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '500' as const },
  titleSmall: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' as const },
  bodyLarge: { fontFamily: 'System', fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { fontFamily: 'System', fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  labelLarge: { fontFamily: 'System', fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' as const },
  labelMedium: { fontFamily: 'System', fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' as const },
  labelSmall: { fontFamily: 'System', fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' as const },
};

// MuleSoft / Anypoint brand colors
const anypointColors = {
  primary: '#00A1E0',         // MuleSoft blue
  primaryDark: '#0078B8',
  primaryLight: '#4DC9F6',
  secondary: '#5C6BC0',      // Indigo accent
  accent: '#00BFA5',         // Teal accent
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  critical: '#D32F2F',
  info: '#2196F3',
  muleGreen: '#00C853',
  mulePurple: '#7C4DFF',
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: anypointColors.primary,
    primaryContainer: '#D1EFFF',
    secondary: anypointColors.secondary,
    secondaryContainer: '#E8EAF6',
    tertiary: anypointColors.accent,
    tertiaryContainer: '#B2DFDB',
    error: anypointColors.error,
    errorContainer: '#FFCDD2',
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceVariant: '#F0F2F5',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#004A6E',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#1A237E',
    onTertiary: '#FFFFFF',
    onTertiaryContainer: '#004D40',
    onBackground: '#1A1C1E',
    onSurface: '#1A1C1E',
    onSurfaceVariant: '#44474E',
    outline: '#74777F',
    outlineVariant: '#C4C6D0',
    elevation: {
      level0: 'transparent',
      level1: '#F5F7FA',
      level2: '#EFF1F5',
      level3: '#E8EBF0',
      level4: '#E6E9EE',
      level5: '#E1E4EA',
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: anypointColors.primary,
    primaryContainer: '#0A3D5C',
    secondary: '#9FA8DA',
    secondaryContainer: '#2D3A6E',
    tertiary: '#80CBC4',
    tertiaryContainer: '#00574B',
    error: '#F48FB1',
    errorContainer: '#93000A',
    background: '#0D1117',
    surface: '#161B22',
    surfaceVariant: '#1C2128',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#D1EFFF',
    onSecondary: '#1A237E',
    onSecondaryContainer: '#E8EAF6',
    onTertiary: '#004D40',
    onTertiaryContainer: '#B2DFDB',
    onBackground: '#E6EDF3',
    onSurface: '#E6EDF3',
    onSurfaceVariant: '#8B949E',
    outline: '#30363D',
    outlineVariant: '#21262D',
    inverseSurface: '#E6EDF3',
    inverseOnSurface: '#0D1117',
    inversePrimary: '#004A6E',
    elevation: {
      level0: 'transparent',
      level1: '#161B22',
      level2: '#1C2128',
      level3: '#1F2937',
      level4: '#243040',
      level5: '#293548',
    },
  },
};

export const statusColors = {
  started: anypointColors.success,
  stopped: '#9E9E9E',
  failed: anypointColors.error,
  deploying: anypointColors.warning,
  active: anypointColors.success,
  inactive: '#9E9E9E',
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

export { anypointColors };
