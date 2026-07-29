// ═══════════════════════════════════════════════════════════════════
// MuleOps Design Tokens
// ═══════════════════════════════════════════════════════════════════
// Screens name ROLES ("the raised surface", "the muted label"), never
// raw values. Every role resolves here, once, for both colour schemes —
// so restyling the app is editing this file rather than 60 screens, and
// light mode is defined by construction instead of being a code path
// nobody exercised.
//
// Replaces two patterns that had spread through the screens:
//   - 136 hard-coded colour literals
//   - `someColor + '12'` string concatenation for tinted backgrounds,
//     which silently produces an invalid colour whenever the input is
//     rgba()/3-digit hex. Use withAlpha() instead.
// ═══════════════════════════════════════════════════════════════════

import { Platform } from 'react-native';

// ── Primitives ──────────────────────────────────────────────────────
// Raw values. Not for use in screens — they carry no meaning on their
// own. Semantic tokens below are the public surface.

const palette = {
  blue500: '#00A1E0', // MuleSoft brand
  blue400: '#31C1FF',
  blue600: '#0078B8',
  indigo400: '#818CF8',
  green500: '#22C55E',
  green400: '#34D399',
  amber500: '#F59E0B',
  red500: '#EF4444',
  red600: '#DC2626',
  violet400: '#A78BFA',

  navy950: '#050816',
  navy900: '#091428',
  navy850: '#0A1628',
  navy800: '#0F1F3A',
  navy700: '#16294A',

  white: '#FFFFFF',
  grey50: '#F8FBFF',
  grey100: '#EAF2FC',
  grey200: '#D7E2F0',
  grey400: '#9AA8BD',
  grey500: '#6B7280',
  grey700: '#374151',
  grey900: '#111827',
  black: '#000000',
} as const;

// ── Alpha ───────────────────────────────────────────────────────────
// Named tint strengths, replacing the 15 ad-hoc hex suffixes that were
// scattered through the screens.

export const alpha = {
  /** Barely-there wash — tinted card backgrounds. */
  faint: 0.07,
  /** Standard tinted chip/icon background. */
  subtle: 0.12,
  /** Visible tint — hover/pressed fills. */
  soft: 0.2,
  /** Divider-strength. */
  border: 0.16,
  /** Muted foreground. */
  muted: 0.56,
  /** Near-solid overlay. */
  heavy: 0.85,
} as const;

export type AlphaToken = keyof typeof alpha;

/**
 * Apply opacity to any colour string — hex (#rgb, #rrggbb, #rrggbbaa),
 * rgb()/rgba(), or a named colour.
 *
 * This exists because the codebase used `color + '12'`, which only works
 * for 6-digit hex and yields an invalid colour for anything else.
 */
export function withAlpha(color: string, amount: number | AlphaToken): string {
  const value = typeof amount === 'number' ? amount : alpha[amount];
  const clamped = Math.max(0, Math.min(1, value));

  const input = color.trim();

  // rgb() / rgba() — rewrite the alpha channel.
  const rgbMatch = input.match(/^rgba?\(\s*([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => p.trim());
    const [r, g, b] = parts;
    if (r !== undefined && g !== undefined && b !== undefined) {
      return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }
    return input;
  }

  if (input.startsWith('#')) {
    let hex = input.slice(1);
    // Expand shorthand (#abc / #abcd) to full length.
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    // Drop any existing alpha channel; the requested one wins.
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length !== 6) return input;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return input;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  // Named colours can't be decomposed; return unchanged rather than
  // producing something invalid.
  return input;
}

// ── Type ramp ───────────────────────────────────────────────────────
// Nine roles, consolidating the 17 ad-hoc font sizes that were in use.
// Sizes stay unscaled numbers so React Native's own Dynamic Type
// scaling continues to apply on top of them.

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700' | '800';
  letterSpacing: number;
}

export const type = {
  /** Hero numbers — the big metric on a stat card. */
  metric: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  /** Screen titles. */
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  /** Section and card headings. */
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  /** Sub-headings and emphasised rows. */
  subheading: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  /** Default reading size. */
  body: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  /** Secondary copy inside dense rows. */
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
  /** Field labels, chips. */
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
  /** Timestamps, metadata. */
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 0.3 },
  /** Smallest legible tier — unit suffixes, axis ticks. */
  micro: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4 },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof type;

/** Monospace family for technical values (ids, log lines, versions). */
export const monoFontFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

// ── Motion ──────────────────────────────────────────────────────────

export const motion = {
  duration: {
    /** Micro-feedback: press states, ripples. */
    instant: 120,
    /** Standard UI transition. */
    quick: 220,
    /** Entrances, expanding sections. */
    settled: 320,
  },
  /** Spring config for reanimated/Animated springs. */
  spring: { damping: 18, stiffness: 180, mass: 1 },
} as const;

// ── Semantic colour roles ───────────────────────────────────────────

export interface StatusRole {
  /** The saturated colour — icons, text, indicator dots. */
  base: string;
  /** Tinted background for chips and icon wells. */
  surface: string;
  /** Border for a tinted container. */
  border: string;
}

export interface ColorTokens {
  surface: {
    /** Page background. */
    canvas: string;
    /** Cards and sheets sitting on the canvas. */
    raised: string;
    /** Elements above a card — nested wells, inputs. */
    sunken: string;
    /** Floating chrome: tab bar, popovers. */
    overlay: string;
  };
  border: {
    subtle: string;
    default: string;
    strong: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    /** On top of a saturated brand/status fill. */
    inverse: string;
    accent: string;
  };
  brand: {
    base: string;
    bright: string;
    surface: string;
  };
  status: {
    success: StatusRole;
    warning: StatusRole;
    danger: StatusRole;
    info: StatusRole;
    neutral: StatusRole;
  };
  /** Shadow colour appropriate to the scheme. */
  shadow: string;
}

function statusRole(base: string): StatusRole {
  return {
    base,
    surface: withAlpha(base, alpha.subtle),
    border: withAlpha(base, alpha.border),
  };
}

const darkColors: ColorTokens = {
  surface: {
    canvas: palette.navy900,
    raised: palette.navy850,
    sunken: palette.navy950,
    overlay: withAlpha(palette.navy800, 0.96),
  },
  border: {
    subtle: withAlpha(palette.blue400, 0.1),
    default: withAlpha(palette.white, 0.1),
    strong: withAlpha(palette.white, 0.2),
  },
  text: {
    primary: palette.grey50,
    secondary: withAlpha(palette.grey100, 0.72),
    tertiary: withAlpha(palette.grey100, alpha.muted),
    inverse: palette.navy950,
    accent: palette.blue400,
  },
  brand: {
    base: palette.blue500,
    bright: palette.blue400,
    surface: withAlpha(palette.blue500, alpha.subtle),
  },
  status: {
    success: statusRole(palette.green500),
    warning: statusRole(palette.amber500),
    danger: statusRole(palette.red500),
    info: statusRole(palette.blue500),
    neutral: statusRole(palette.grey400),
  },
  shadow: palette.black,
};

const lightColors: ColorTokens = {
  surface: {
    canvas: palette.grey50,
    raised: palette.white,
    sunken: palette.grey100,
    overlay: withAlpha(palette.white, 0.96),
  },
  border: {
    subtle: withAlpha(palette.blue600, 0.12),
    default: withAlpha(palette.grey900, 0.12),
    strong: withAlpha(palette.grey900, 0.24),
  },
  text: {
    primary: palette.grey900,
    secondary: withAlpha(palette.grey900, 0.68),
    tertiary: withAlpha(palette.grey900, 0.48),
    inverse: palette.white,
    accent: palette.blue600,
  },
  brand: {
    base: palette.blue500,
    bright: palette.blue600,
    surface: withAlpha(palette.blue500, alpha.faint),
  },
  status: {
    success: statusRole('#15803D'),
    warning: statusRole('#B45309'),
    danger: statusRole('#B91C1C'),
    info: statusRole(palette.blue600),
    neutral: statusRole(palette.grey500),
  },
  shadow: '#03162C',
};

export interface Tokens {
  color: ColorTokens;
  type: typeof type;
  alpha: typeof alpha;
  motion: typeof motion;
  monoFontFamily: string;
  /** True when the dark scheme is in effect. */
  isDark: boolean;
}

const darkTokens: Tokens = Object.freeze({
  color: darkColors,
  type,
  alpha,
  motion,
  monoFontFamily: monoFontFamily as string,
  isDark: true,
});

const lightTokens: Tokens = Object.freeze({
  color: lightColors,
  type,
  alpha,
  motion,
  monoFontFamily: monoFontFamily as string,
  isDark: false,
});

/** Token set for a colour scheme. Both objects are stable references. */
export function getTokens(isDark: boolean): Tokens {
  return isDark ? darkTokens : lightTokens;
}

export { palette as _palette };
