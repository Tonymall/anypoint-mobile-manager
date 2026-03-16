import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

async function openExternalUrl(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      return;
    }

    await Linking.openURL(url);
  } catch {
    // Ignore store-link open failures in unsupported runtimes.
  }
}

interface UpdateRequiredScreenProps {
  currentVersion: string;
  minimumVersion: string;
  onRetry: () => void;
}

const APP_STORE_URL = 'https://apps.apple.com/';
const PLAY_STORE_URL = 'https://play.google.com/store/apps';

const UpdateRequiredScreen: React.FC<UpdateRequiredScreenProps> = ({
  currentVersion,
  minimumVersion,
  onRetry,
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
          Update Required
        </Text>
        <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
          This version of MuleOps is no longer supported. Update the app to continue.
        </Text>

        <View style={styles.meta}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>
            Installed: {currentVersion}
          </Text>
          <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
            Minimum: {minimumVersion}
          </Text>
        </View>

        <Button mode="contained" onPress={onRetry} style={styles.button}>
          Check Again
        </Button>
        <Button mode="outlined" onPress={() => void openExternalUrl(APP_STORE_URL)} style={styles.button}>
          Open App Store
        </Button>
        <Button mode="outlined" onPress={() => void openExternalUrl(PLAY_STORE_URL)} style={styles.button}>
          Open Play Store
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    lineHeight: 22,
    marginBottom: 20,
  },
  meta: {
    gap: 6,
    marginBottom: 20,
  },
  button: {
    marginTop: 10,
  },
});

export default UpdateRequiredScreen;
