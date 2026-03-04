import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { statusColors } from '../../theme';

type StatusKey = keyof typeof statusColors;

interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'medium' }) => {
  const theme = useTheme();

  const normalizedStatus = status.toLowerCase().replace(/[_\s]/g, '') as string;

  const statusKeyMap: Record<string, StatusKey> = {
    started: 'started',
    stopped: 'stopped',
    failed: 'failed',
    deploying: 'deploying',
    active: 'active',
    inactive: 'inactive',
    deprecated: 'deprecated',
    blocked: 'blocked',
    running: 'running',
    disconnected: 'disconnected',
    pending: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    undeploying: 'stopped',
    partiallystarted: 'deploying',
    deployed: 'active',
    created: 'pending',
    updated: 'active',
  };

  const mappedKey = statusKeyMap[normalizedStatus];
  const backgroundColor = mappedKey
    ? statusColors[mappedKey]
    : theme.colors.outline;

  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor,
          paddingVertical: isSmall ? 2 : 4,
          paddingHorizontal: isSmall ? 8 : 12,
          borderRadius: isSmall ? 10 : 12,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontSize: isSmall ? 10 : 12,
            lineHeight: isSmall ? 14 : 16,
          },
        ]}
      >
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default StatusBadge;
