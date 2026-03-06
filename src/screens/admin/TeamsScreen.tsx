// ============================================================
// Teams Screen — Team list with create FAB + dialog
// 2026 Modern Dark-First Design
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
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
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';
import {
  useTeams,
  useCreateTeam,
} from '../../hooks/queries/useAccessManagementQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  roles: any[];
  parentTeamId?: string;
}

// ── Team Card Component ──
const TeamCard = React.memo<{
  team: Team;
  theme: MD3Theme;
}>(({ team, theme }) => (
  <View
    style={{
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
      padding: 16,
    }}
  >
    {/* Header */}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: anypointColors.secondary + '14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name="account-multiple" size={20} color={anypointColors.secondary} />
      </View>
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
          {team.name}
        </Text>
        {team.description ? (
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.onSurfaceVariant,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {team.description}
          </Text>
        ) : null}
      </View>
    </View>

    {/* Badges */}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: theme.colors.surfaceVariant + '80',
        }}
      >
        <Icon name="account-group" size={12} color={theme.colors.onSurfaceVariant} />
        <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {team.memberCount ?? 0} member{(team.memberCount ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: theme.colors.surfaceVariant + '80',
        }}
      >
        <Icon name="shield-check" size={12} color={theme.colors.onSurfaceVariant} />
        <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {team.roles?.length ?? 0} role{(team.roles?.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  </View>
));
TeamCard.displayName = 'TeamCard';

// ── Main Screen ──
const TeamsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: teams, isLoading, error, refetch, isRefetching } = useTeams();
  const createTeam = useCreateTeam();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const teamsList = useMemo(() => (teams as any)?.data ?? [], [teams]) as Team[];

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    hapticLight();
    try {
      await createTeam.mutateAsync({ name: newName.trim(), description: newDescription.trim() });
      setDialogVisible(false);
      setNewName('');
      setNewDescription('');
    } catch {
      // Error handled by mutation
    }
  }, [newName, newDescription, createTeam]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Team>) => (
      <TeamCard team={item} theme={theme} />
    ),
    [theme],
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
          <Icon name="account-multiple" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No teams found
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          Create a team to organize members and roles.
        </Text>
      </View>
    ),
    [styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading teams..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.replace('/(main)/admin' as any)} />
        <Appbar.Content title="Teams" titleStyle={styles.headerTitle} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.secondary + '12',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.secondary }}>
            {teamsList.length}
          </Text>
        </View>
      </Appbar.Header>

      <FlatList
        data={teamsList}
        keyExtractor={(item) => item.id}
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
        accessibilityLabel="Create new team"
      />

      {/* Create Dialog */}
      <Portal>
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Create Team</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              label="Team Name"
              value={newName}
              onChangeText={setNewName}
              mode="outlined"
              autoFocus
              style={{ backgroundColor: theme.colors.surface }}
            />
            <TextInput
              label="Description"
              value={newDescription}
              onChangeText={setNewDescription}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={{ backgroundColor: theme.colors.surface }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleCreate}
              mode="contained"
              loading={createTeam.isPending}
              disabled={!newName.trim() || createTeam.isPending}
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

export default TeamsScreen;
