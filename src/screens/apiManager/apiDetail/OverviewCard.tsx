// ============================================================
// API Detail - Overview card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Card, Text } from 'react-native-paper';

import type * as apiManagerService from '../../../services/apiManagerService';
import type { ManagedAPI } from '../../../types';
import InfoItem from './InfoItem';
import { type APIDetailStyles } from './styles';

interface OverviewCardProps {
  styles: APIDetailStyles;
  api: ManagedAPI | undefined;
  apiAsset: apiManagerService.APIAssetSummary | null | undefined;
  governanceReport: apiManagerService.APIGovernanceReportSummary | null | undefined;
}

const OverviewCard: React.FC<OverviewCardProps> = ({ styles, api, apiAsset, governanceReport }) => (
  <Card style={styles.card}>
    <Card.Content>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Overview
      </Text>
      <View style={styles.infoList}>
        <InfoItem label="Status" value={api?.status ?? 'Unknown'} />
        <InfoItem label="Technology" value={api?.technology ?? 'Unknown'} />
        <InfoItem label="Endpoint" value={api?.endpointUri ?? 'Not exposed'} mono />
        <InfoItem label="Autodiscovery" value={api?.autodiscoveryInstanceName ?? 'Not set'} />
        <InfoItem label="Asset" value={apiAsset?.exchangeAssetName ?? api?.assetId ?? 'Unknown'} />
        <InfoItem label="Governance" value={governanceReport?.status ?? 'Unknown'} />
      </View>
    </Card.Content>
  </Card>
);

export default OverviewCard;
