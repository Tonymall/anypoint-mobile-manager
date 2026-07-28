// ============================================================
// API Detail - policy configuration dialog
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text, TextInput, useTheme } from 'react-native-paper';

import { type PolicyDialogState } from './types';
import { type APIDetailStyles } from './styles';

interface PolicyConfigDialogProps {
  styles: APIDetailStyles;
  dialog: PolicyDialogState;
  setDialog: React.Dispatch<React.SetStateAction<PolicyDialogState>>;
  onSubmit: () => Promise<void>;
}

const PolicyConfigDialog: React.FC<PolicyConfigDialogProps> = ({
  styles,
  dialog,
  setDialog,
  onSubmit,
}) => {
  const theme = useTheme();

  return (
    <Dialog
      visible={dialog.visible}
      onDismiss={() =>
        setDialog({
          visible: false,
          loading: false,
          submitting: false,
          template: null,
          values: {},
        })
      }
    >
      <Dialog.Title>{dialog.template?.name ?? 'Configure policy'}</Dialog.Title>
      <Dialog.Content>
        {dialog.loading ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Loading policy configuration...
          </Text>
        ) : (
          <>
            <Text variant="bodySmall" style={styles.dialogHelp}>
              {dialog.template?.description ?? 'Set policy values before applying it to this API.'}
            </Text>
            {(dialog.template?.configurationFields ?? []).map((field) => {
              const value = dialog.values[field.propertyName];
              if (field.type === 'boolean') {
                return (
                  <View key={field.propertyName} style={styles.autoApproveRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                        {field.name}
                      </Text>
                      {field.description ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {field.description}
                        </Text>
                      ) : null}
                    </View>
                    <Button
                      compact
                      mode="text"
                      onPress={() =>
                        setDialog((current) => ({
                          ...current,
                          values: {
                            ...current.values,
                            [field.propertyName]: !value,
                          },
                        }))
                      }
                    >
                      {value ? 'On' : 'Off'}
                    </Button>
                  </View>
                );
              }

              if ((field.enumValues?.length ?? 0) > 0) {
                return (
                  <View key={field.propertyName} style={styles.dialogInput}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
                      {field.name}
                    </Text>
                    {field.description ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                        {field.description}
                      </Text>
                    ) : null}
                    <View style={styles.optionRow}>
                      {field.enumValues?.map((option) => {
                        const selected = String(value ?? '') === option;
                        return (
                          <Button
                            key={`${field.propertyName}-${option}`}
                            compact
                            mode={selected ? 'contained-tonal' : 'outlined'}
                            onPress={() =>
                              setDialog((current) => ({
                                ...current,
                                values: {
                                  ...current.values,
                                  [field.propertyName]: option,
                                },
                              }))
                            }
                            style={styles.optionButton}
                          >
                            {option}
                          </Button>
                        );
                      })}
                    </View>
                  </View>
                );
              }

              return (
                <TextInput
                  key={field.propertyName}
                  mode="outlined"
                  label={field.name}
                  value={String(value ?? '')}
                  secureTextEntry={field.sensitive}
                  keyboardType={field.type === 'int' ? 'number-pad' : 'default'}
                  onChangeText={(nextValue) =>
                    setDialog((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        [field.propertyName]: nextValue,
                      },
                    }))
                  }
                  style={styles.dialogInput}
                />
              );
            })}
          </>
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <Button
          onPress={() =>
            setDialog({
              visible: false,
              loading: false,
              submitting: false,
              template: null,
              values: {},
            })
          }
        >
          Cancel
        </Button>
        <Button
          onPress={() => void onSubmit()}
          loading={dialog.submitting}
          disabled={dialog.loading}
        >
          Apply
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
};

export default PolicyConfigDialog;
