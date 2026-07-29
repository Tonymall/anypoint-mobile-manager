// ═══════════════════════════════════════════════════════════════════
// useTokens — scheme-aware access to the design tokens
// ═══════════════════════════════════════════════════════════════════
// Reads the active scheme from the Paper theme that already wraps the
// app, so tokens and Paper components can never disagree about whether
// we are in dark mode.
//
//   const t = useTokens();
//   <View style={{ backgroundColor: t.color.surface.raised }} />
//
// For StyleSheet.create, pass the tokens into a createStyles(t) factory
// memoised on `t` — the same pattern the screens already use with the
// Paper theme. Both token objects are stable references, so the memo
// only recomputes when the scheme actually flips.
// ═══════════════════════════════════════════════════════════════════

import { useTheme } from 'react-native-paper';

import { getTokens, type Tokens } from './tokens';

export function useTokens(): Tokens {
  const { dark } = useTheme();
  return getTokens(dark);
}

export type { Tokens };
