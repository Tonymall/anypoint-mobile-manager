// ============================================================
// Login — Footer
// ============================================================

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { spacing, typeScale, useTokens } from '../../../theme';

export interface LoginFooterProps {
  version: string;
}

function LoginFooter({ version }: LoginFooterProps) {
  const t = useTokens();

  return (
    <View style={styles.root}>
      <Text style={[typeScale.caption, { color: t.color.text.secondary }]}>
        Anypoint Platform · MuleOps
      </Text>
      <Text
        style={[typeScale.caption, { color: t.color.text.tertiary }]}
        accessibilityLabel={`App version ${version}`}
      >
        {`v${version}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 2,
    width: '100%',
    paddingTop: spacing.sm,
  },
});

export default memo(LoginFooter);
