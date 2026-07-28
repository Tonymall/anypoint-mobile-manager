// ============================================================
// API Detail - SLA tier create/edit dialog
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text, TextInput, useTheme } from 'react-native-paper';

import { type TierDialogState, type TierDraft } from './types';
import { type APIDetailStyles } from './styles';

interface TierDialogProps {
  styles: APIDetailStyles;
  dialog: TierDialogState;
  draft: TierDraft;
  submitting: boolean;
  onChangeDraft: React.Dispatch<React.SetStateAction<TierDraft>>;
  onDismiss: () => void;
  onSubmit: () => Promise<void>;
}

const TierDialog: React.FC<TierDialogProps> = ({
  styles,
  dialog,
  draft,
  submitting,
  onChangeDraft,
  onDismiss,
  onSubmit,
}) => {
  const theme = useTheme();

  return (
    <Dialog visible={dialog.visible} onDismiss={onDismiss}>
      <Dialog.Title>{dialog.mode === 'edit' ? 'Edit SLA tier' : 'Create SLA tier'}</Dialog.Title>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          label="Tier name"
          value={draft.name}
          onChangeText={(value) => onChangeDraft((current) => ({ ...current, name: value }))}
          style={styles.dialogInput}
        />
        <TextInput
          mode="outlined"
          label="Description"
          value={draft.description}
          onChangeText={(value) => onChangeDraft((current) => ({ ...current, description: value }))}
          style={styles.dialogInput}
        />
        <TextInput
          mode="outlined"
          label="Max requests"
          value={draft.maximumRequests}
          onChangeText={(value) => onChangeDraft((current) => ({ ...current, maximumRequests: value }))}
          keyboardType="number-pad"
          style={styles.dialogInput}
        />
        <TextInput
          mode="outlined"
          label="Period (seconds)"
          value={draft.periodSeconds}
          onChangeText={(value) => onChangeDraft((current) => ({ ...current, periodSeconds: value }))}
          keyboardType="number-pad"
          style={styles.dialogInput}
        />
        <View style={styles.autoApproveRow}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {draft.autoApprove ? 'Auto-approve applications' : 'Manual approval required'}
          </Text>
          <Button
            compact
            mode="text"
            onPress={() =>
              onChangeDraft((current) => ({ ...current, autoApprove: !current.autoApprove }))
            }
          >
            Toggle
          </Button>
        </View>
        <View style={styles.autoApproveRow}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {draft.status === 'ACTIVE' ? 'Tier is active' : 'Tier is deprecated'}
          </Text>
          <Button
            compact
            mode="text"
            onPress={() =>
              onChangeDraft((current) => ({
                ...current,
                status: current.status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE',
              }))
            }
          >
            Toggle
          </Button>
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button onPress={() => void onSubmit()} loading={submitting}>
          {dialog.mode === 'edit' ? 'Save' : 'Create'}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
};

export default TierDialog;
