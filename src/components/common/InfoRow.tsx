// ============================================================
// InfoRow — label/value row inside a detail card
// ============================================================
// Built on the design token layer, so the divider, label and value
// contrast are defined once for both colour schemes.
// ============================================================

import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { spacing, typeScale, useTokens, withAlpha } from '../../theme';
import type { IconName } from '../../types/icons';

interface InfoRowProps {
  label: string;
  value: string | number;
  onPress?: () => void;
  icon?: IconName;
  copyable?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({
  label,
  value,
  onPress,
  icon,
  copyable = false,
}) => {
  const t = useTokens();

  const content = (
    <View
      style={[styles.container, { borderBottomColor: t.color.border.subtle }]}
    >
      <View style={styles.labelContainer}>
        {icon && (
          <Icon
            name={icon}
            size={18}
            color={t.color.text.tertiary}
            style={styles.icon}
          />
        )}
        <Text style={[styles.label, { color: t.color.text.secondary }]}>
          {label}
        </Text>
      </View>
      <View style={styles.valueContainer}>
        <Text
          style={[
            styles.value,
            { color: onPress ? t.color.text.accent : t.color.text.primary },
          ]}
          numberOfLines={2}
          selectable={!onPress}
        >
          {String(value)}
        </Text>
        {(onPress || copyable) && (
          <Icon
            name={copyable ? 'content-copy' : 'chevron-right'}
            size={16}
            color={t.color.text.tertiary}
            style={styles.actionIcon}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: withAlpha(t.color.text.primary, 'faint') }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.lg,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: { ...typeScale.body, flexShrink: 1 },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  value: {
    ...typeScale.body,
    textAlign: 'right',
    flexShrink: 1,
  },
  actionIcon: {
    marginLeft: spacing.xs,
  },
});

export default InfoRow;
