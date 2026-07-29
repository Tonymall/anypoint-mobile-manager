// ============================================================
// ErrorState — the shared "this request failed" block
// ============================================================
// Built on the design token layer, so the hint box, debug block and
// buttons are defined once for both colour schemes.
// ============================================================

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Button } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { monoFontFamily, radii, spacing, typeScale, useTokens } from '../../theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = 'Retry',
}) => {
  const t = useTokens();
  const [showDetails, setShowDetails] = useState(false);
  const showError = useErrorDialogStore((state) => state.showError);

  // Split message into summary and debug details (separated by \n[Debug:)
  const debugSplit = message.indexOf('\n[Debug:');
  const summary = debugSplit >= 0 ? message.slice(0, debugSplit) : message;
  const debugInfo = debugSplit >= 0 ? message.slice(debugSplit + 1) : null;

  // Detect HTTP status from the message
  const has403 = message.includes('403');
  const has401 = message.includes('401');
  const statusHint = has403
    ? '403 = Access Denied. This usually means the org/env headers or token are wrong.'
    : has401
      ? '401 = Unauthorized. The access token may have expired. Try signing out and back in.'
      : null;

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      <View style={[styles.iconWell, { backgroundColor: t.color.status.danger.surface }]}>
        <Icon
          name="alert-circle-outline"
          size={32}
          color={t.color.status.danger.base}
        />
      </View>
      <Text style={[styles.title, { color: t.color.text.primary }]}>
        Something went wrong
      </Text>
      <Text
        style={[styles.message, { color: t.color.text.secondary }]}
        selectable
      >
        {summary}
      </Text>

      {statusHint && (
        <View
          style={[
            styles.hintBox,
            {
              backgroundColor: t.color.status.danger.surface,
              borderColor: t.color.status.danger.border,
            },
          ]}
        >
          <Icon name="information-outline" size={16} color={t.color.status.danger.base} />
          <Text style={[styles.hintText, { color: t.color.text.secondary }]}>
            {statusHint}
          </Text>
        </View>
      )}

      {debugInfo && (
        <>
          <Button
            mode="text"
            onPress={() => setShowDetails(!showDetails)}
            icon={showDetails ? 'chevron-up' : 'chevron-down'}
            compact
            style={styles.detailsToggle}
          >
            {showDetails ? 'Hide Debug Info' : 'Show Debug Info'}
          </Button>
          {showDetails && (
            <View style={[styles.debugBox, { backgroundColor: t.color.surface.sunken }]}>
              <Text
                style={[styles.debugText, { color: t.color.text.primary }]}
                selectable
              >
                {debugInfo}
              </Text>
            </View>
          )}
        </>
      )}

      {onRetry && (
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={() =>
              showError({
                title: 'Request failed',
                message: summary,
                details: debugInfo ?? statusHint ?? undefined,
              })
            }
            style={styles.button}
            icon="bug-outline"
            textColor={t.color.text.secondary}
          >
            Report Bug
          </Button>
          <Button
            mode="contained"
            onPress={onRetry}
            style={styles.button}
            icon="refresh"
            buttonColor={t.color.brand.base}
            textColor={t.color.text.inverse}
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            {retryLabel}
          </Button>
        </View>
      )}

      {!onRetry && (
        <Button
          mode="outlined"
          onPress={() =>
            showError({
              title: 'Request failed',
              message: summary,
              details: debugInfo ?? statusHint ?? undefined,
            })
          }
          style={styles.button}
          icon="bug-outline"
          textColor={t.color.text.secondary}
        >
          Report Bug
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
    minHeight: 200,
  },
  iconWell: {
    width: 68,
    height: 68,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typeScale.heading,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typeScale.bodySmall,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 340,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    maxWidth: 340,
  },
  hintText: { ...typeScale.bodySmall, fontWeight: '400', flex: 1 },
  detailsToggle: {
    marginBottom: spacing.sm,
  },
  debugBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    maxWidth: 340,
    width: '100%',
  },
  debugText: {
    ...typeScale.caption,
    fontWeight: '400',
    fontFamily: monoFontFamily,
    lineHeight: 18,
  },
  button: {
    borderRadius: radii.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});

export default ErrorState;
