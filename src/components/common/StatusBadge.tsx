// ============================================================
// StatusBadge — a status word as a tinted pill
// ============================================================
// Built on the design token layer: the status resolves to a semantic
// role, so the badge is legible on both colour schemes instead of
// relying on white-on-saturated-fill.
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { radii, spacing, typeScale, useTokens, type StatusRole, type Tokens } from '../../theme';

interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
}

/** Normalised status word → semantic status role. */
function statusRole(t: Tokens, normalized: string): StatusRole {
  switch (normalized) {
    case 'started':
    case 'active':
    case 'running':
    case 'approved':
    case 'deployed':
    case 'updated':
      return t.color.status.success;
    case 'failed':
    case 'blocked':
    case 'disconnected':
    case 'rejected':
      return t.color.status.danger;
    case 'deploying':
    case 'undeploying':
    case 'partiallystarted':
    case 'deprecated':
    case 'pending':
    case 'created':
      return t.color.status.warning;
    case 'stopped':
    case 'inactive':
      return t.color.status.neutral;
    default:
      return t.color.status.neutral;
  }
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'medium' }) => {
  const t = useTokens();

  const normalizedStatus = status.toLowerCase().replace(/[_\s]/g, '');
  const role = statusRole(t, normalizedStatus);
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: role.surface,
          paddingVertical: isSmall ? 2 : spacing.xs,
          paddingHorizontal: isSmall ? spacing.sm : spacing.md,
          borderRadius: radii.sm,
        },
      ]}
    >
      <Text style={[isSmall ? styles.textSmall : styles.text, { color: role.base }]}>
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
    ...typeScale.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textSmall: {
    ...typeScale.micro,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default StatusBadge;
