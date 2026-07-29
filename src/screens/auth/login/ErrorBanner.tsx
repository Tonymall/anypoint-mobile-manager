// ============================================================
// Login — Error surface
// ============================================================
// The screen previously reported every failure through the global
// error dialog, which the user dismisses and then has nothing left
// to read while retyping. This mirrors the same message inline and
// keeps it on screen until the next attempt. It reports; it does
// not classify — the wording comes verbatim from the caller.
// ============================================================

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';

export interface LoginErrorState {
  title: string;
  message: string;
  detail?: string;
}

export interface ErrorBannerProps {
  error: LoginErrorState | null;
  onDismiss: () => void;
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const t = useTokens();

  if (!error) return null;

  const role = t.color.status.danger;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[
        styles.root,
        { backgroundColor: role.surface, borderColor: role.border },
      ]}
    >
      <Icon name="alert-circle" size={18} color={role.base} style={styles.icon} />

      <View style={styles.body}>
        <Text style={[typeScale.subheading, { color: role.base }]}>{error.title}</Text>
        <Text style={[typeScale.bodySmall, styles.message, { color: t.color.text.primary }]}>
          {error.message}
        </Text>
        {error.detail ? (
          <Text style={[typeScale.caption, styles.detail, { color: t.color.text.secondary }]}>
            {error.detail}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onDismiss}
        hitSlop={spacing.sm}
        accessibilityRole="button"
        accessibilityLabel="Dismiss error"
        style={({ pressed }) => [
          styles.dismiss,
          {
            backgroundColor: pressed ? withAlpha(role.base, 'subtle') : 'transparent',
          },
        ]}
      >
        <Icon name="close" size={16} color={t.color.text.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  icon: {
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  message: {
    marginTop: 2,
  },
  detail: {
    marginTop: spacing.xs,
  },
  dismiss: {
    padding: spacing.xs,
    borderRadius: radii.sm,
  },
});

export default memo(ErrorBanner);
