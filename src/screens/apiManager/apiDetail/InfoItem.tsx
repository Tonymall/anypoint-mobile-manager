// ============================================================
// API Detail - Info Item row
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Divider, Text, useTheme } from 'react-native-paper';

const InfoItem: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{
          color: theme.colors.onSurface,
          fontFamily: mono ? 'monospace' : undefined,
        }}
      >
        {value}
      </Text>
      <Divider />
    </View>
  );
};

export default InfoItem;
