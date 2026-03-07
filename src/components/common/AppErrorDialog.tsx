import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { submitBugReport } from '../../services/bugReportService';
import logger from '../../utils/logger';

const AppErrorDialog: React.FC = () => {
  const theme = useTheme();
  const { visible, title, message, details, hideError } = useErrorDialogStore();
  const [thankYouVisible, setThankYouVisible] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const handleDismiss = useCallback(() => {
    hideError();
  }, [hideError]);

  const handleReport = useCallback(async () => {
    if (isReporting) return;
    setIsReporting(true);
    try {
      await submitBugReport({ title, message, details });
      hideError();
      setThankYouVisible(true);
    } catch (error: any) {
      logger.error('[ErrorDialog] Report bug failed:', error?.message);
      hideError();
      useErrorDialogStore.getState().showError({
        title: 'Could not submit bug report',
        message:
          error?.message || 'The app could not submit the bug report right now. Please try again later.',
      });
    } finally {
      setIsReporting(false);
    }
  }, [details, hideError, isReporting, message, title]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Icon icon={() => <Icon name="alert-circle-outline" size={28} color={theme.colors.error} />} />
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {message}
          </Text>
          {details ? (
            <View style={[styles.detailsBox, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {details}
              </Text>
            </View>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss}>Dismiss</Button>
          <Button mode="contained" onPress={handleReport} loading={isReporting} disabled={isReporting}>
            Report Bug
          </Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={thankYouVisible} onDismiss={() => setThankYouVisible(false)} style={styles.dialog}>
        <Dialog.Icon icon={() => <Icon name="check-circle-outline" size={28} color={theme.colors.primary} />} />
        <Dialog.Title>Thank you</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            Thank you for reporting the issue.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button mode="contained" onPress={() => setThankYouVisible(false)}>
            Continue
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 20,
  },
  detailsBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
});

export default AppErrorDialog;
