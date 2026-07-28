// ============================================================
// API Detail - Policy catalog card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

import type * as apiManagerService from '../../../services/apiManagerService';
import { anypointColors } from '../../../theme';
import { normalizePolicyKey } from './helpers';
import { type APIDetailStyles } from './styles';

interface PolicyCatalogCardProps {
  styles: APIDetailStyles;
  templates: apiManagerService.APIPolicyTemplate[];
  appliedPolicyKeys: Set<string>;
  policyApplyBusyId: string | null;
  onConfigure: (template: apiManagerService.APIPolicyTemplate) => Promise<void>;
  onOpenDocs: (url?: string | null) => Promise<void>;
}

const PolicyCatalogCard: React.FC<PolicyCatalogCardProps> = ({
  styles,
  templates,
  appliedPolicyKeys,
  policyApplyBusyId,
  onConfigure,
  onOpenDocs,
}) => {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.sectionHeaderInline}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Policy catalog
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              This catalog includes the policy set you called out, with live template metadata when the control plane exposes it.
            </Text>
          </View>
        </View>

        {templates.map((template) => {
          const applied =
            appliedPolicyKeys.has(normalizePolicyKey(template.id))
            || appliedPolicyKeys.has(normalizePolicyKey(template.name));
          const canConfigure = !applied && !!template.groupId && !!template.assetId && !!template.assetVersion;

          return (
            <View key={template.id} style={[styles.policyCard, { borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.policyHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{template.name}</Text>
                  <Text style={styles.rowMeta}>{template.category}</Text>
                </View>
                <Text style={[styles.badge, { color: applied ? anypointColors.success : theme.colors.onSurfaceVariant }]}>
                  {applied ? 'Applied' : 'Available'}
                </Text>
              </View>
              <Text style={styles.policyDescription}>{template.description}</Text>
              <View style={styles.metaChipRow}>
                {template.isSlaBased ? (
                  <Text style={[styles.metaChip, { color: anypointColors.warning }]}>SLA based</Text>
                ) : null}
                {!canConfigure && !applied ? (
                  <Text style={styles.metaChip}>Read only</Text>
                ) : null}
                {template.providedCharacteristics.slice(0, 2).map((value) => (
                  <Text key={value} style={styles.metaChip}>
                    {value}
                  </Text>
                ))}
              </View>
              <View style={styles.templateActions}>
                {canConfigure ? (
                  <Button
                    compact
                    mode="contained-tonal"
                    onPress={() => void onConfigure(template)}
                    loading={policyApplyBusyId === template.id}
                  >
                    Configure
                  </Button>
                ) : null}
                {template.docsUrl ? (
                  <Button
                    compact
                    mode="text"
                    onPress={() => void onOpenDocs(template.docsUrl)}
                    style={styles.inlineButton}
                  >
                    Learn more
                  </Button>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card.Content>
    </Card>
  );
};

export default PolicyCatalogCard;
