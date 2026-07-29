import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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
  const theme = useTheme();

  const content = (
    <View
      style={[
        styles.container,
        { borderBottomColor: theme.colors.outlineVariant },
      ]}
    >
      <View style={styles.labelContainer}>
        {icon && (
          <Icon
            name={icon}
            size={18}
            color={theme.colors.onSurfaceVariant}
            style={styles.icon}
          />
        )}
        <Text
          variant="bodyMedium"
          style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.valueContainer}>
        <Text
          variant="bodyMedium"
          style={[
            styles.value,
            { color: theme.colors.onSurface },
            onPress && { color: theme.colors.primary },
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
            color={theme.colors.onSurfaceVariant}
            style={styles.actionIcon}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: theme.colors.surfaceVariant }}>
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  icon: {
    marginRight: 8,
  },
  label: {
    flexShrink: 1,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  value: {
    textAlign: 'right',
    flexShrink: 1,
  },
  actionIcon: {
    marginLeft: 4,
  },
});

export default InfoRow;
