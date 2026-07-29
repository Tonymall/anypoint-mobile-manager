// ============================================================
// API Detail - Applied policies card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { anypointColors } from '../../../theme';
import type { APIPolicy } from '../../../types';
import { type APIDetailStyles } from './styles';

interface AppliedPoliciesCardProps {
  styles: APIDetailStyles;
  policies: APIPolicy[] | undefined;
  policyRemoveBusyId: number | null;
  onRemovePolicy: (policyId: number) => Promise<void>;
}

const AppliedPoliciesCard: React.FC<AppliedPoliciesCardProps> = ({
  styles,
  policies,
  policyRemoveBusyId,
  onRemovePolicy,
}) => {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Applied policies
        </Text>
        <Text variant="bodySmall" style={styles.sectionSubtitle}>
          Live policy state comes from the API Manager policies endpoint. Available policy templates below are enriched from the xAPI template catalog captured in your HAR.
        </Text>

        {(policies ?? []).length > 0 ? (
          (policies ?? []).map((policy) => (
            <View key={policy.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
              <View style={[styles.iconWrap, { backgroundColor: anypointColors.primary + '12' }]}>
                <Icon name="shield-check-outline" size={18} color={anypointColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{policy.assetId || policy.policyTemplateId}</Text>
                <Button
                  compact
                  mode="text"
                  onPress={() => void onRemovePolicy(policy.id)}
                  loading={policyRemoveBusyId === policy.id}
                  style={styles.inlineButton}
                >
                  Remove
                </Button>
                <Text style={styles.rowMeta}>
                  order {policy.order} • {policy.disabled ? 'disabled' : 'active'}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text variant="bodySmall" style={styles.emptyCopy}>
            No applied policies returned for this API instance.
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

export default AppliedPoliciesCard;
