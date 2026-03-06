// ============================================================
// Alerts Tab — Segmented: Feed | Platform | Rules
// ============================================================

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SegmentedControl from '../../../src/components/common/SegmentedControl';
import NotificationsScreen from '../../../src/screens/notifications/NotificationsScreen';
import PlatformAlertsScreen from '../../../src/screens/alerts/PlatformAlertsScreen';
import AlertRulesScreen from '../../../src/screens/alerts/AlertRulesScreen';

const SEGMENTS = [
  { key: 'feed', label: 'Feed' },
  { key: 'platform', label: 'Platform' },
  { key: 'rules', label: 'Rules' },
];

export default function AlertsIndex() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeSegment, setActiveSegment] = useState('feed');

  const handleSegmentChange = useCallback((key: string) => {
    setActiveSegment(key);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <SegmentedControl
        segments={SEGMENTS}
        activeKey={activeSegment}
        onChange={handleSegmentChange}
      />
      {activeSegment === 'feed' && <NotificationsScreen />}
      {activeSegment === 'platform' && <PlatformAlertsScreen />}
      {activeSegment === 'rules' && <AlertRulesScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
