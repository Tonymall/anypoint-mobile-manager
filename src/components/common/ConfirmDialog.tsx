import React from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { hapticWarning, hapticMedium } from '../../utils/haptics';
import { radii, spacing, typeScale, useTokens } from '../../theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  confirmLoading?: boolean;
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
  confirmDisabled = false,
  cancelDisabled = false,
  confirmLoading = false,
}) => {
  const t = useTokens();

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onCancel}
        style={[styles.dialog, { backgroundColor: t.color.surface.raised }]}
        testID={`confirm-dialog-${title}`}
      >
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.message, { color: t.color.text.secondary }]}>
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button onPress={onCancel} textColor={t.color.text.secondary} disabled={cancelDisabled}>
            {cancelLabel}
          </Button>
          <Button
            onPress={() => { destructive ? hapticWarning() : hapticMedium(); onConfirm(); }}
            mode="contained"
            disabled={confirmDisabled}
            loading={confirmLoading}
            buttonColor={
              destructive ? t.color.status.danger.base : t.color.brand.base
            }
            textColor={t.color.text.inverse}
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
    borderRadius: radii.lg,
  },
  message: typeScale.body,
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  confirmButton: {
    borderRadius: radii.xl,
    marginLeft: spacing.sm,
  },
});

export default ConfirmDialog;
