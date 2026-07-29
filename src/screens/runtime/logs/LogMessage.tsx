// ═══════════════════════════════════════════════════════════════════
// Logs — Log message renderer
// ═══════════════════════════════════════════════════════════════════
// Mule log lines routinely carry JSON or XML payloads flattened onto
// one line — and rarely just one. A single `... response : { body:
// <xml/> , headers: ["<?xml ...?>"] }` holds two, and stopping at the
// first leaves the rest as an unreadable clipped tail.
//
// So the line is segmented into prose and payloads *in order*, and each
// payload becomes its own collapsed, syntax-coloured, copyable block
// with the prose around it preserved.
//
// Collapsed by default on purpose: these rows live in a virtualised
// list, and formatting every payload on mount would cost the scroll
// budget for a block almost nobody reads. Segmentation is memoised per
// message; formatting and tokenising only happen once expanded.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { spacing, typeScale, useTokens } from '../../../theme';
import {
  MAX_PAYLOADS_PER_MESSAGE,
  segmentMessage,
} from '../../../utils/logFormat';
import PayloadBlock from './PayloadBlock';

export interface LogMessageProps {
  /** The raw log line. */
  message: string;
}

function LogMessage({ message }: LogMessageProps) {
  const t = useTokens();

  // Cheap: one bounded scan per message, cached for the row's lifetime.
  const segmented = useMemo(() => segmentMessage(message), [message]);

  // No payload: render exactly as the screen always has.
  if (segmented.payloadCount === 0) {
    return (
      <Text
        style={[styles.message, { color: t.color.text.primary }]}
        numberOfLines={4}
      >
        {message}
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {segmented.segments.map((segment, index) =>
        segment.type === 'prose' ? (
          <Text
            key={`prose-${index}`}
            style={[styles.prose, { color: t.color.text.primary }]}
            numberOfLines={3}
          >
            {segment.text}
          </Text>
        ) : (
          <PayloadBlock
            key={`payload-${segment.start}`}
            kind={segment.kind}
            raw={segment.raw}
          />
        ),
      )}

      {segmented.more ? (
        <Text style={[styles.more, { color: t.color.text.tertiary }]}>
          {`Showing the first ${MAX_PAYLOADS_PER_MESSAGE} payloads — tap the entry for the full line.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  message: {
    ...typeScale.bodySmall,
    marginBottom: spacing.sm,
  },
  prose: {
    ...typeScale.bodySmall,
    marginTop: 6,
  },
  more: {
    ...typeScale.micro,
    marginTop: 6,
  },
});

export default memo(LogMessage);
