import React, { useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = 'Retry',
}) => {
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);

  // Split message into summary and debug details (separated by \n[Debug:)
  const debugSplit = message.indexOf('\n[Debug:');
  const summary = debugSplit >= 0 ? message.slice(0, debugSplit) : message;
  const debugInfo = debugSplit >= 0 ? message.slice(debugSplit + 1) : null;

  // Detect HTTP status from the message
  const has403 = message.includes('403');
  const has401 = message.includes('401');
  const statusHint = has403
    ? '403 = Access Denied. This usually means the org/env headers or token are wrong.'
    : has401
      ? '401 = Unauthorized. The access token may have expired. Try signing out and back in.'
      : null;

  return (
    <View style={styles.container}>
      <Icon
        name="alert-circle-outline"
        size={56}
        color={theme.colors.error}
        style={styles.icon}
      />
      <Text
        variant="titleMedium"
        style={[styles.title, { color: theme.colors.onSurface }]}
      >
        Something went wrong
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
        selectable
      >
        {summary}
      </Text>

      {statusHint && (
        <View style={[styles.hintBox, { backgroundColor: theme.colors.errorContainer }]}>
          <Icon name="information-outline" size={16} color={theme.colors.onErrorContainer} />
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onErrorContainer, flex: 1, marginLeft: 8 }}
          >
            {statusHint}
          </Text>
        </View>
      )}

      {debugInfo && (
        <>
          <Button
            mode="text"
            onPress={() => setShowDetails(!showDetails)}
            icon={showDetails ? 'chevron-up' : 'chevron-down'}
            compact
            style={{ marginBottom: 8 }}
          >
            {showDetails ? 'Hide Debug Info' : 'Show Debug Info'}
          </Button>
          {showDetails && (
            <View style={[styles.debugBox, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurface,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 11,
                  lineHeight: 18,
                }}
                selectable
              >
                {debugInfo}
              </Text>
            </View>
          )}
        </>
      )}

      {onRetry && (
        <Button
          mode="contained"
          onPress={onRetry}
          style={styles.button}
          icon="refresh"
          accessibilityLabel="Retry loading"
          accessibilityRole="button"
        >
          {retryLabel}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 340,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    maxWidth: 340,
  },
  debugBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    maxWidth: 340,
    width: '100%',
  },
  button: {
    borderRadius: 20,
  },
});

export default ErrorState;
