// ============================================================
// EmptyState — the shared "there is nothing here" block
// ============================================================
// Built on the design token layer, so it reads correctly on both
// colour schemes.
//
// Layout note: this used to combine `justifyContent: 'center'` with a
// symmetric 32pt padding inside a `flex: 1` box, and callers added
// their own `paddingTop: 80` on top. The result was a block stranded
// below the optical centre with a dead gap under the screen title. It
// now centres in the space it is given with a deliberate upward bias
// (bottom padding exceeds top padding), which is where the eye expects
// an empty state to sit. `flexGrow: 1` fills a FlatList content
// container that grows, and collapses to its own height when the block
// is dropped inside a scrolling section.
//
// Two distinct jobs, both driven by the copy the caller supplies:
//   - nothing exists yet → explain what will appear here and why
//   - a filter excluded everything → offer to clear it via the action
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Button } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../theme';
import type { IconName } from '../../types/icons';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox-outline',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const t = useTokens();

  return (
    <View style={styles.container} accessibilityLabel={title}>
      <View
        style={[
          styles.iconWell,
          {
            backgroundColor: t.color.surface.sunken,
            borderColor: t.color.border.subtle,
          },
        ]}
      >
        <Icon name={icon} size={34} color={t.color.text.tertiary} />
      </View>

      <Text style={[styles.title, { color: t.color.text.primary }]}>
        {title}
      </Text>

      {description ? (
        <Text style={[styles.description, { color: t.color.text.secondary }]}>
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.button}
          buttonColor={withAlpha(t.color.brand.base, 'subtle')}
          textColor={t.color.text.accent}
          labelStyle={styles.buttonLabel}
          accessibilityLabel={actionLabel}
        >
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    // Asymmetric on purpose: pulls the block above the geometric centre,
    // where an empty state reads as placed rather than stranded.
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl + spacing.xxl,
    minHeight: 240,
  },
  iconWell: {
    width: 76,
    height: 76,
    borderRadius: radii.xl,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typeScale.heading,
    textAlign: 'center',
  },
  description: {
    ...typeScale.bodySmall,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  button: {
    borderRadius: radii.md,
    marginTop: spacing.xl,
  },
  buttonLabel: {
    ...typeScale.label,
  },
});

export default EmptyState;
