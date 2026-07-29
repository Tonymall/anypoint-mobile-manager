// ============================================================
// Permissions Screen — Read-only grouped permission list
// 2026 Modern Dark-First Design
// ============================================================

import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Appbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { usePermissions } from '../../hooks/queries/useAccessManagementQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface Permission {
  resource: string;
  actions: string[];
}

// ── Action chip color helper ──
const getActionColor = (action: string): string => {
  const a = action.toLowerCase();
  if (a === 'read' || a === 'view' || a === 'get') return anypointColors.info;
  if (a === 'create' || a === 'write' || a === 'post') return anypointColors.success;
  if (a === 'update' || a === 'edit' || a === 'put' || a === 'patch') return anypointColors.warning;
  if (a === 'delete' || a === 'remove') return anypointColors.error;
  return anypointColors.secondary;
};

// ── Permission Group Component ──
const PermissionGroup: React.FC<{
  permission: Permission;
  theme: MD3Theme;
}> = ({ permission, theme }) => (
  <View
    style={{
      marginBottom: 10,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    }}
  >
    {/* Resource header */}
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: anypointColors.warning + '14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name="folder-lock" size={16} color={anypointColors.warning} />
      </View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.onSurface,
          flex: 1,
        }}
        numberOfLines={1}
      >
        {permission.resource}
      </Text>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
          backgroundColor: theme.colors.surfaceVariant,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
          {permission.actions.length}
        </Text>
      </View>
    </View>

    {/* Action chips */}
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: 14,
        paddingBottom: 14,
      }}
    >
      {permission.actions.map((action) => {
        const color = getActionColor(action);
        return (
          <View
            key={action}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              backgroundColor: color + '12',
            }}
          >
            <Icon name="check-circle" size={12} color={color} />
            <Text style={{ fontSize: 11, fontWeight: '600', color, letterSpacing: 0.2 }}>
              {action}
            </Text>
          </View>
        );
      })}
    </View>
  </View>
);

// ── Main Screen ──
const PermissionsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: permissions, isLoading, error, refetch } = usePermissions();

  const permissionsList = useMemo(() => (permissions as Permission[]) ?? [], [permissions]);

  if (isLoading) return <LoadingState message="Loading permissions..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Permissions" titleStyle={styles.headerTitle} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.warning + '12',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.warning }}>
            {permissionsList.length}
          </Text>
        </View>
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {permissionsList.length === 0 ? (
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
              <Icon name="shield-check" size={36} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
              No permissions found
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              No resource permissions configured for this organization.
            </Text>
          </View>
        ) : (
          permissionsList.map((perm, index) => (
            <PermissionGroup key={`${perm.resource}-${index}`} permission={perm} theme={theme} />
          ))
        )}
      </ScrollView>
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
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
  });

export default PermissionsScreen;
