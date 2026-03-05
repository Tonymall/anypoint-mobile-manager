import React from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { hapticWarning, hapticMedium } from '../../utils/haptics';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}) => {
  const theme = useTheme();

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={styles.dialog} testID={`confirm-dialog-${title}`}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button onPress={onCancel} textColor={theme.colors.onSurfaceVariant}>
            {cancelLabel}
          </Button>
          <Button
            onPress={() => { destructive ? hapticWarning() : hapticMedium(); onConfirm(); }}
            mode="contained"
            buttonColor={
              destructive ? theme.colors.error : theme.colors.primary
            }
            textColor={
              destructive ? '#FFFFFF' : theme.colors.onPrimary
            }
            style={styles.confirmButton}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  confirmButton: {
    borderRadius: 20,
    marginLeft: 8,
  },
});

export default ConfirmDialog;
