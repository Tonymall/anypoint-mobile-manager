import React, { useState, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  Button,
  Dialog,
  Portal,
  Text,
  TouchableRipple,
  useTheme,
  Divider,
  RadioButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '../../stores';
import type { Environment } from '../../types';

interface EnvironmentSelectorProps {
  compact?: boolean;
  onEnvironmentChange?: (environment: Environment) => void;
}

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  compact = false,
  onEnvironmentChange,
}) => {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  const currentEnvironment = useAuthStore((state) => state.currentEnvironment);
  const environments = useAuthStore((state) => state.environments);
  const switchEnvironment = useAuthStore((state) => state.switchEnvironment);

  const handleSelect = useCallback(
    (environment: Environment) => {
      switchEnvironment(environment);
      onEnvironmentChange?.(environment);
      setVisible(false);
    },
    [switchEnvironment, onEnvironmentChange],
  );

  const getEnvironmentIcon = (type: Environment['type']): string => {
    switch (type) {
      case 'production':
        return 'shield-check';
      case 'sandbox':
        return 'test-tube';
      case 'design':
        return 'pencil-ruler';
      default:
        return 'server';
    }
  };

  const getEnvironmentColor = (type: Environment['type']): string => {
    switch (type) {
      case 'production':
        return theme.colors.error;
      case 'sandbox':
        return theme.colors.tertiary;
      case 'design':
        return theme.colors.secondary;
      default:
        return theme.colors.outline;
    }
  };

  const renderEnvironmentItem = ({ item }: { item: Environment }) => {
    const isSelected = currentEnvironment?.id === item.id;
    const envColor = getEnvironmentColor(item.type);

    return (
      <TouchableRipple onPress={() => handleSelect(item)}>
        <View
          style={[
            styles.envItem,
            isSelected && {
              backgroundColor: theme.colors.primaryContainer,
            },
          ]}
        >
          <Icon
            name={getEnvironmentIcon(item.type)}
            size={20}
            color={envColor}
            style={styles.envIcon}
          />
          <View style={styles.envInfo}>
            <Text
              variant="bodyMedium"
              style={[
                styles.envName,
                { color: theme.colors.onSurface },
                isSelected && { fontWeight: '600' },
              ]}
            >
              {item.name}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
            </Text>
          </View>
          <RadioButton
            value={item.id}
            status={isSelected ? 'checked' : 'unchecked'}
            onPress={() => handleSelect(item)}
            color={theme.colors.primary}
          />
        </View>
      </TouchableRipple>
    );
  };

  const triggerLabel = currentEnvironment?.name ?? 'Select Environment';

  return (
    <>
      {compact ? (
        <TouchableRipple
          onPress={() => setVisible(true)}
          style={[
            styles.compactTrigger,
            { borderColor: theme.colors.outlineVariant },
          ]}
          borderless
        >
          <View style={styles.compactTriggerContent}>
            {currentEnvironment && (
              <Icon
                name={getEnvironmentIcon(currentEnvironment.type)}
                size={16}
                color={getEnvironmentColor(currentEnvironment.type)}
                style={styles.triggerIcon}
              />
            )}
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.onSurface }}
              numberOfLines={1}
            >
              {triggerLabel}
            </Text>
            <Icon
              name="chevron-down"
              size={16}
              color={theme.colors.onSurfaceVariant}
              style={styles.chevron}
            />
          </View>
        </TouchableRipple>
      ) : (
        <Button
          mode="outlined"
          onPress={() => setVisible(true)}
          icon={
            currentEnvironment
              ? getEnvironmentIcon(currentEnvironment.type)
              : 'server'
          }
          contentStyle={styles.buttonContent}
          style={styles.button}
        >
          {triggerLabel}
        </Button>
      )}

      <Portal>
        <Dialog
          visible={visible}
          onDismiss={() => setVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Select Environment</Dialog.Title>
          <Divider />
          <Dialog.ScrollArea style={styles.scrollArea}>
            {environments.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon
                  name="server-off"
                  size={40}
                  color={theme.colors.outlineVariant}
                />
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.emptyText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  No environments available
                </Text>
              </View>
            ) : (
              <FlatList
                data={environments}
                keyExtractor={(item) => item.id}
                renderItem={renderEnvironmentItem}
                ItemSeparatorComponent={Divider}
              />
            )}
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  compactTrigger: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compactTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggerIcon: {
    marginRight: 6,
  },
  chevron: {
    marginLeft: 4,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    flexDirection: 'row-reverse',
  },
  dialog: {
    borderRadius: 16,
    maxHeight: '70%',
  },
  scrollArea: {
    paddingHorizontal: 0,
    maxHeight: 400,
  },
  envItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  envIcon: {
    marginRight: 12,
  },
  envInfo: {
    flex: 1,
  },
  envName: {
    marginBottom: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    marginTop: 12,
    textAlign: 'center',
  },
});

export default EnvironmentSelector;
