// ============================================================
// API Detail - Hero card with headline stats
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';

import { anypointColors } from '../../../theme';
import type { APIContract, APIPolicy, ManagedAPI, SLATier } from '../../../types';
import { type APIDetailStyles } from './styles';

interface HeroCardProps {
  styles: APIDetailStyles;
  title: string;
  isLoading: boolean;
  api: ManagedAPI | undefined;
  policies: APIPolicy[] | undefined;
  slaTiers: SLATier[] | undefined;
  contracts: APIContract[];
  pendingContracts: APIContract[];
}

const HeroCard: React.FC<HeroCardProps> = ({
  styles,
  title,
  isLoading,
  api,
  policies,
  slaTiers,
  contracts,
  pendingContracts,
}) => {
  const theme = useTheme();

  return (
    <Card style={styles.heroCard}>
      <Card.Content>
        <Text variant="titleLarge" style={styles.heroTitle}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={styles.heroCopy}>
          HAR-backed API Manager detail view with policies, contracts, SLA tiers, and governance state in one place.
        </Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {isLoading ? '...' : (policies?.length ?? api?.policies?.length ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Policies</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.accent + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.accent }]}>
              {slaTiers?.length ?? api?.slaTiers?.length ?? 0}
            </Text>
            <Text style={styles.statLabel}>SLA tiers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>
              {contracts.length}
            </Text>
            <Text style={styles.statLabel}>Contracts</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.success }]}>
              {pendingContracts.length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
};

export default HeroCard;
