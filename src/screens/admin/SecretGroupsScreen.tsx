// ============================================================
// Secret Groups Screen — List with create FAB
// 2026 Modern Dark-First Design
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ListRenderItemInfo,
} from 'react-native';
import {
  Appbar,
  Text,
  FAB,
  Portal,
  Dialog,
  Button,
  TextInput,
  Switch,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';
import { formatRelativeTime } from '../../utils/statusHelpers';
import {
  useSecretGroups,
  useCreateSecretGroup,
} from '../../hooks/queries/useSecretManagerQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface SecretGroup {
  id: string;
  name: string;
  downloadable: boolean;
  createdAt: string;
}

// ── Secret Group Card Component ──
const SecretGroupCard = React.memo<{
  group: SecretGroup;
  onPress: () => void;
  theme: MD3Theme;
}>(({ group, onPress, theme }) => (
  <Pressable
    onPress={() => {
      hapticLight();
      onPress();
    }}
    android_ripple={{ color: theme.colors.primaryContainer }}
    accessibilityLabel={`${group.name}, ${group.downloadable ? 'downloadable' : 'not downloadable'}`}
    accessibilityRole="button"
    accessibilityHint="Double tap to view details"
    style={({ pressed }) => [
      {
        marginBottom: 8,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
      },
    ]}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
      {/* Icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: anypointColors.error + '14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name="lock" size={22} color={anypointColors.error} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: theme.colors.onSurface,
            letterSpacing: -0.2,
          }}
          numberOfLines={1}
        >
          {group.name}
        </Text>
        {group.createdAt && (
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.onSurfaceVariant,
              marginTop: 2,
            }}
          >
            Created {formatRelativeTime(group.createdAt)}
          </Text>
        )}
      </View>

      {/* Downloadable badge */}
      {group.downloadable && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.success + '12',
          }}
        >
          <Icon name="download" size={13} color={anypointColors.success} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: anypointColors.success }}>
            DL
          </Text>
        </View>
      )}

      <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
    </View>
  </Pressable>
));
SecretGroupCard.displayName = 'SecretGroupCard';

// ── Main Screen ──
const SecretGroupsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: groups, isLoading, error, refetch, isRefetching } = useSecretGroups();
  const createSecretGroup = useCreateSecretGroup();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDownloadable, setNewDownloadable] = useState(false);

  const groupsList = useMemo(() => (groups as SecretGroup[]) ?? [], [groups]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    hapticLight();
    try {
      await createSecretGroup.mutateAsync({
        name: newName.trim(),
        downloadable: newDownloadable,
      });
      setDialogVisible(false);
      setNewName('');
      setNewDownloadable(false);
    } catch {
      // Error handled by mutation
    }
  }, [newName, newDownloadable, createSecretGroup]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SecretGroup>) => (
      <SecretGroupCard
        group={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/admin/secret-detail' as any,
            params: { groupId: item.id },
          })
        }
        theme={theme}
      />
    ),
    [theme, router],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="lock" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No secret groups
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          Create a secret group to manage keystores, certificates, and TLS contexts.
        </Text>
      </View>
    ),
    [styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading secret groups..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Secret Groups" titleStyle={styles.headerTitle} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.error + '12',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.error }}>
            {groupsList.length}
          </Text>
        </View>
      </Appbar.Header>

      <FlatList
        data={groupsList}
        keyExtractor={(item, index) => `${item.id ?? item.name ?? 'secret-group'}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
      />

      {/* FAB */}
      <FAB
        icon="plus"
        onPress={() => {
          hapticLight();
          setDialogVisible(true);
        }}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        color={theme.colors.onPrimary}
        customSize={56}
        accessibilityLabel="Create new secret group"
      />

      {/* Create Dialog */}
      <Portal>
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Create Secret Group</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              label="Group Name"
              value={newName}
              onChangeText={setNewName}
              mode="outlined"
              autoFocus
              style={{ backgroundColor: theme.colors.surface }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 14, color: theme.colors.onSurface, fontWeight: '500' }}>
                Downloadable
              </Text>
              <Switch
                value={newDownloadable}
                onValueChange={setNewDownloadable}
              />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleCreate}
              mode="contained"
              loading={createSecretGroup.isPending}
              disabled={!newName.trim() || createSecretGroup.isPending}
              style={{ borderRadius: 20 }}
            >
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 100,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
    fab: {
      position: 'absolute',
      right: 16,
      backgroundColor: theme.colors.primary,
      borderRadius: 16,
    },
    dialog: {
      borderRadius: 24,
    },
  });

export default SecretGroupsScreen;
