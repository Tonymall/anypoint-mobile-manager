// ============================================================
// Alerts Tab - Segmented: Feed | Platform
// ============================================================

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SegmentedControl from '../../../src/components/common/SegmentedControl';
import NotificationsScreen from '../../../src/screens/notifications/NotificationsScreen';
import PlatformAlertsScreen from '../../../src/screens/alerts/PlatformAlertsScreen';

const SEGMENTS = [
  { key: 'feed', label: 'Feed' },
  { key: 'platform', label: 'Platform' },
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});



