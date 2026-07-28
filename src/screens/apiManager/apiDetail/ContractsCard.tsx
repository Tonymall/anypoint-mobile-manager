// ============================================================
// API Detail - Contracts card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

import { anypointColors } from '../../../theme';
import type { APIContract } from '../../../types';
import { type ContractActionState } from './types';
import { type APIDetailStyles } from './styles';

interface ContractsCardProps {
  styles: APIDetailStyles;
  contracts: APIContract[];
  contractAction: ContractActionState;
  onContractAction: (contractId: number, action: 'approve' | 'reject') => Promise<void>;
}

const ContractsCard: React.FC<ContractsCardProps> = ({
  styles,
  contracts,
  contractAction,
  onContractAction,
}) => {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Contracts
        </Text>
        {contracts.length > 0 ? (
          contracts.map((contract) => {
            const actionBusy = contractAction.contractId === contract.id;
            return (
              <View key={contract.id} style={[styles.contractCard, { borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.policyHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{contract.applicationName}</Text>
                    <Text style={styles.rowMeta}>
                      {contract.tierName || 'No tier'} • requested {contract.requestedDate ? new Date(contract.requestedDate).toLocaleDateString() : 'unknown'}
                    </Text>
                  </View>
                  <Text style={[styles.badge, { color: contract.status === 'APPROVED' ? anypointColors.success : contract.status === 'PENDING' ? anypointColors.warning : theme.colors.onSurfaceVariant }]}>
                    {contract.status}
                  </Text>
                </View>

                {contract.status === 'PENDING' ? (
                  <View style={styles.contractActions}>
                    <Button
                      mode="contained-tonal"
                      compact
                      onPress={() => void onContractAction(contract.id, 'approve')}
                      loading={actionBusy && contractAction.action === 'approve'}
                    >
                      Approve
                    </Button>
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => void onContractAction(contract.id, 'reject')}
                      loading={actionBusy && contractAction.action === 'reject'}
                    >
                      Reject
                    </Button>
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text variant="bodySmall" style={styles.emptyCopy}>
            No contracts returned for this API instance.
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

export default ContractsCard;
