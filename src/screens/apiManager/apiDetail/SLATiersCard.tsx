// ============================================================
// API Detail - SLA tiers card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { anypointColors } from '../../../theme';
import type { SLATier } from '../../../types';
import { type APIDetailStyles } from './styles';

interface SLATiersCardProps {
  styles: APIDetailStyles;
  slaTiers: SLATier[] | undefined;
  tierDeleteBusyId: number | null;
  onAddTier: () => void;
  onEditTier: (tier: SLATier) => void;
  onDeleteTier: (tierId: number) => Promise<void>;
}

const SLATiersCard: React.FC<SLATiersCardProps> = ({
  styles,
  slaTiers,
  tierDeleteBusyId,
  onAddTier,
  onEditTier,
  onDeleteTier,
}) => {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.sectionHeaderInline}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              SLA tiers
            </Text>
          </View>
          <Button mode="contained-tonal" compact onPress={onAddTier}>
            Add tier
          </Button>
        </View>
        {(slaTiers ?? []).length > 0 ? (
          (slaTiers ?? []).map((tier) => (
            <View key={tier.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
              <View style={[styles.iconWrap, { backgroundColor: anypointColors.accent + '12' }]}>
                <Icon name="speedometer" size={18} color={anypointColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{tier.name}</Text>
                <Text style={styles.rowMeta}>
                  {tier.autoApprove ? 'Auto-approve' : 'Manual approval'} • {tier.status}
                </Text>
                {(tier.limits ?? []).map((limit, index) => (
                  <Text key={`${tier.id}-${index}`} style={styles.tierLimit}>
                    {limit.maximumRequests.toLocaleString()} requests / {Math.round(limit.timePeriodInMilliseconds / 1000)}s
                  </Text>
                ))}
                <View style={styles.tierActions}>
                  <Button compact mode="text" onPress={() => onEditTier(tier)}>
                    Edit
                  </Button>
                  <Button
                    compact
                    mode="text"
                    textColor={anypointColors.warning}
                    onPress={() => void onDeleteTier(tier.id)}
                    loading={tierDeleteBusyId === tier.id}
                  >
                    Delete
                  </Button>
                </View>
              </View>
            </View>
          ))
        ) : (
          <Text variant="bodySmall" style={styles.emptyCopy}>
            No SLA tiers returned for this API instance.
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

export default SLATiersCard;
