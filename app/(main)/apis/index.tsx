// ============================================================
// APIs Tab — Segmented: Manager | Exchange | Design Center
// ============================================================

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SegmentedControl from '../../../src/components/common/SegmentedControl';
import APIListScreen from '../../../src/screens/apiManager/APIListScreen';
import ExchangeSearchScreen from '../../../src/screens/exchange/ExchangeSearchScreen';
import ProjectsScreen from '../../../src/screens/designCenter/ProjectsScreen';

const SEGMENTS = [
  { key: 'manager', label: 'Manager' },
  { key: 'exchange', label: 'Exchange' },
  { key: 'design', label: 'Design Center' },
];

export default function APIsIndex() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeSegment, setActiveSegment] = useState('manager');

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
      {activeSegment === 'manager' && <APIListScreen />}
      {activeSegment === 'exchange' && <ExchangeSearchScreen />}
      {activeSegment === 'design' && <ProjectsScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
