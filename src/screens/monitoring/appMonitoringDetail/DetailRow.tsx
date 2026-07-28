// ============================================================
// App Monitoring Detail - Detail Row helper
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, type MD3Theme } from 'react-native-paper';

const DetailRow: React.FC<{ label: string; value: string; theme: MD3Theme }> = ({ label, value, theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{label}</Text>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 12 }}>{value}</Text>
  </View>
);

export default DetailRow;
