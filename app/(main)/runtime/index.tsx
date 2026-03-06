import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '../../../src/components/common';
import ApplicationsListScreen from '../../../src/screens/runtime/ApplicationsListScreen';
import DeploymentHistoryScreen from '../../../src/screens/runtime/DeploymentHistoryScreen';
import InfrastructureHomeScreen from '../../../src/screens/infrastructure/InfrastructureHomeScreen';

const SEGMENTS = [
  { key: 'apps', label: 'Apps' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'infrastructure', label: 'Infrastructure' },
];

export default function RuntimeIndex() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeSegment, setActiveSegment] = useState('apps');

  const handleSegmentChange = useCallback((key: string) => {
    setActiveSegment(key);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.segmentWrapper}>
        <SegmentedControl
          segments={SEGMENTS}
          activeKey={activeSegment}
          onChange={handleSegmentChange}
        />
      </View>
      {activeSegment === 'apps' && <ApplicationsListScreen />}
      {activeSegment === 'deployments' && <DeploymentHistoryScreen />}
      {activeSegment === 'infrastructure' && <InfrastructureHomeScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
});
