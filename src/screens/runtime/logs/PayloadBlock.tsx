// ═══════════════════════════════════════════════════════════════════
// Logs — one collapsible payload block
// ═══════════════════════════════════════════════════════════════════
// A single JSON/XML payload lifted out of a log line: a compact
// toolbar (kind · size, copy) that expands into a syntax-coloured,
// overflow-safe rendering of the pretty-printed payload.
//
// Overflow strategy — soft wrap with a hanging indent, NOT a nested
// horizontal ScrollView. Each line is drawn as
//
//     [indent gutter][content, free to wrap]
//
// so continuation rows align under the start of their own line instead
// of the left margin. The row therefore has one intrinsic height that
// the layout engine measures directly: nothing for FlatList's
// virtualisation to mis-measure, no scroll offset surviving cell
// recycling, and no horizontal pan competing with the list's vertical
// one. Every character stays reachable without a gesture.
//
// The indent gutter is real monospace spaces rather than a computed
// pixel width, so it lines up with the font by construction — no
// character-width estimation anywhere.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';

import { radii, spacing, typeScale, useTokens, type Tokens } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import {
  clampLines,
  formatPayload,
  payloadLabel,
  splitSpanLines,
  tokenizePayload,
  type FormatSkipReason,
  type SpanKind,
} from '../../../utils/logFormat';

/**
 * Lines laid out inside a single row. The full payload is always what
 * gets copied; the card's detail sheet shows the untouched entry.
 */
const PREVIEW_LINES = 120;

/**
 * Character budget for a payload we refused to pretty-print. Those are
 * one enormous line, so the line budget above would not bite.
 */
const PREVIEW_CHARS = 4000;

/** Syntax roles map onto the token palette — never onto raw colours. */
function spanColor(t: Tokens, kind: SpanKind): string {
  switch (kind) {
    case 'key':
    case 'tag':
      return t.color.text.accent;
    case 'string':
    case 'attrValue':
      return t.color.status.success.base;
    case 'number':
    case 'attrName':
      return t.color.status.warning.base;
    case 'boolean':
    case 'cdata':
      return t.color.status.info.base;
    case 'null':
    case 'comment':
    case 'declaration':
    case 'punctuation':
      return t.color.text.tertiary;
    case 'text':
      return t.color.text.primary;
    default:
      return t.color.text.secondary;
  }
}

function skipNotice(reason: FormatSkipReason): string {
  return reason === 'too-large'
    ? 'Payload too large to format — showing it as sent.'
    : 'Payload nested too deeply to format — showing it as sent.';
}

export interface PayloadBlockProps {
  kind: 'json' | 'xml';
  /** The payload substring, verbatim. */
  raw: string;
}

function PayloadBlock({ kind, raw }: PayloadBlockProps) {
  const t = useTokens();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Expensive: only once the user asks to see the payload.
  const rendered = useMemo(() => {
    if (!expanded) return null;
    const result =
      formatPayload(kind, raw) ?? ({ text: raw, formatted: false } as const);
    // Unformatted payloads are a single colossal line — cap characters
    // as well, or the line budget below never bites.
    const source = result.formatted
      ? result.text
      : result.text.slice(0, PREVIEW_CHARS);
    const clamped = clampLines(source, PREVIEW_LINES);
    return {
      formatted: result.formatted,
      reason: 'reason' in result ? result.reason : undefined,
      truncated: source.length < result.text.length,
      ...clamped,
      lines: splitSpanLines(tokenizePayload(kind, clamped.text)),
    };
  }, [expanded, kind, raw]);

  const toggle = useCallback(() => {
    hapticSelection();
    setExpanded((prev) => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    const result = formatPayload(kind, raw);
    hapticSelection();
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    Clipboard.setStringAsync(result?.text ?? raw).catch(() => {
      // Clipboard unavailable — the visual confirmation is harmless.
    });
  }, [kind, raw]);

  const label = payloadLabel(kind, raw);
  const mono = { fontFamily: t.monoFontFamily };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: t.color.surface.sunken,
            borderColor: t.color.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={toggle}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${label} payload`}
          accessibilityHint={
            expanded ? 'Double tap to collapse' : 'Double tap to expand'
          }
        >
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={14}
            color={t.color.text.accent}
          />
          <Text style={[styles.toggleLabel, { color: t.color.text.accent }]}>
            {label}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleCopy}
          hitSlop={10}
          style={styles.copy}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Payload copied' : 'Copy payload'}
        >
          <Icon
            name={copied ? 'check' : 'content-copy'}
            size={14}
            color={copied ? t.color.status.success.base : t.color.text.tertiary}
          />
          <Text
            style={[
              styles.copyLabel,
              {
                color: copied
                  ? t.color.status.success.base
                  : t.color.text.tertiary,
              },
            ]}
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      {expanded && rendered ? (
        <View
          style={[
            styles.payload,
            {
              backgroundColor: t.color.surface.sunken,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          {!rendered.formatted && rendered.reason ? (
            <Text style={[styles.notice, { color: t.color.status.warning.base }]}>
              {skipNotice(rendered.reason)}
            </Text>
          ) : null}

          <View style={styles.code}>
            {rendered.lines.map((line, index) => (
              <View key={index} style={styles.line}>
                {line.indent > 0 ? (
                  <Text style={[styles.codeText, mono, { color: t.color.text.tertiary }]}>
                    {' '.repeat(line.indent)}
                  </Text>
                ) : null}
                <Text
                  selectable
                  style={[
                    styles.codeText,
                    styles.lineBody,
                    mono,
                    { color: t.color.text.secondary },
                  ]}
                >
                  {line.spans.length === 0
                    ? ' '
                    : line.spans.map((span, spanIndex) => (
                        <Text
                          key={spanIndex}
                          style={{ color: spanColor(t, span.kind) }}
                        >
                          {span.text}
                        </Text>
                      ))}
                </Text>
              </View>
            ))}
          </View>

          {rendered.clamped || rendered.truncated ? (
            <Text style={[styles.notice, { color: t.color.text.tertiary }]}>
              {rendered.clamped
                ? `Showing the first ${rendered.shown} of ${rendered.total} lines — copy for the full payload.`
                : 'Showing the start of the payload — copy for all of it.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingLeft: 6,
    paddingRight: spacing.sm,
    paddingVertical: 5,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleLabel: {
    ...typeScale.caption,
    marginLeft: spacing.xs,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyLabel: {
    ...typeScale.micro,
    marginLeft: spacing.xs,
  },
  payload: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
  },
  code: {
    paddingHorizontal: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  lineBody: {
    flex: 1,
  },
  codeText: {
    ...typeScale.caption,
    fontWeight: '400',
    lineHeight: 16,
  },
  notice: {
    ...typeScale.micro,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
});

export default memo(PayloadBlock);
