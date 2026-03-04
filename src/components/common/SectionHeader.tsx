import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onAction,
  actionIcon,
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text
          variant="titleMedium"
          style={[styles.title, { color: theme.colors.onSurface }]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            variant="bodySmall"
            style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {actionLabel && onAction && (
        <Button
          mode="text"
          onPress={onAction}
          compact
          icon={actionIcon}
        >
          {actionLabel}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 2,
  },
});

export default SectionHeader;
