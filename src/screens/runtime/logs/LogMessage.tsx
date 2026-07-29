// ═══════════════════════════════════════════════════════════════════
// Logs — Log message renderer
// ═══════════════════════════════════════════════════════════════════
// Mule log lines routinely end in a JSON or XML payload flattened onto
// one line. Rendered raw that is an unreadable wall, so we split the
// line into "prose" + "payload" and offer the payload as a collapsed,
// syntax-coloured, copyable block.
//
// Collapsed by default on purpose: these rows live in a virtualised
// list, and formatting every payload on mount would cost the scroll
// budget for a block almost nobody reads. Detection is memoised per
// message; formatting and tokenising only happen once expanded.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';

import { typeScale, useTokens, type Tokens } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import {
  clampLines,
  detectPayload,
  formatPayload,
  payloadLabel,
  tokenizePayload,
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

function skipNotice(reason: 'too-large' | 'too-deep'): string {
  return reason === 'too-large'
    ? 'Payload too large to format — showing it as sent.'
    : 'Payload nested too deeply to format — showing it as sent.';
}

export interface LogMessageProps {
  /** The raw log line. */
  message: string;
}

function LogMessage({ message }: LogMessageProps) {
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

  // Cheap: one bounded scan per message, cached for the row's lifetime.
  const payload = useMemo(() => detectPayload(message), [message]);

  // Expensive: only once the user asks to see the payload.
  const rendered = useMemo(() => {
    if (!expanded || payload.kind === 'none') return null;
    const result =
      formatPayload(payload.kind, payload.raw) ??
      ({ text: payload.raw, formatted: false } as const);
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
      spans: tokenizePayload(payload.kind, clamped.text),
    };
  }, [expanded, payload]);

  const toggle = useCallback(() => {
    hapticSelection();
    setExpanded((prev) => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    const result = formatPayload(payload.kind, payload.raw);
    hapticSelection();
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    Clipboard.setStringAsync(result?.text ?? payload.raw).catch(() => {
      // Clipboard unavailable — the visual confirmation is harmless.
    });
  }, [payload]);

  // No payload: render exactly as the screen always has.
  if (payload.kind === 'none') {
    return (
      <Text
        style={[styles.message, { color: t.color.text.primary }]}
        numberOfLines={4}
      >
        {message}
      </Text>
    );
  }

  const prose = payload.prose.trim();
  const trailing = payload.trailing.trim();
  const label = payloadLabel(payload.kind, payload.raw);

  return (
    <View style={styles.wrap}>
      {prose ? (
        <Text
          style={[styles.prose, { color: t.color.text.primary }]}
          numberOfLines={3}
        >
          {prose}
        </Text>
      ) : null}

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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.code}
          >
            <Text
              selectable
              style={[
                styles.codeText,
                {
                  fontFamily: t.monoFontFamily,
                  color: t.color.text.secondary,
                },
              ]}
            >
              {rendered.spans.map((span, index) => (
                <Text
                  key={index}
                  style={{ color: spanColor(t, span.kind) }}
                >
                  {span.text}
                </Text>
              ))}
            </Text>
          </ScrollView>
          {rendered.clamped || rendered.truncated ? (
            <Text style={[styles.notice, { color: t.color.text.tertiary }]}>
              {rendered.clamped
                ? `Showing the first ${rendered.shown} of ${rendered.total} lines — copy for the full payload.`
                : 'Showing the start of the payload — copy for all of it.'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {trailing ? (
        <Text
          style={[styles.trailing, { color: t.color.text.secondary }]}
          numberOfLines={2}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  message: {
    ...typeScale.bodySmall,
    marginBottom: 8,
  },
  prose: {
    ...typeScale.bodySmall,
    marginBottom: 6,
  },
  trailing: {
    ...typeScale.caption,
    marginTop: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 5,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleLabel: {
    ...typeScale.caption,
    marginLeft: 4,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyLabel: {
    ...typeScale.micro,
    marginLeft: 4,
  },
  payload: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
  },
  code: {
    paddingHorizontal: 10,
  },
  codeText: {
    ...typeScale.caption,
    fontWeight: '400',
    lineHeight: 16,
  },
  notice: {
    ...typeScale.micro,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});

export default memo(LogMessage);
