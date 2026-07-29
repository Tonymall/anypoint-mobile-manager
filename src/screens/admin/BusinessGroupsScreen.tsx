// ============================================================
// Business Groups Screen — Expandable org hierarchy tree
// 2026 Modern Dark-First Design
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
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
import { hapticLight } from '../../utils/haptics';
import { useBusinessGroups } from '../../hooks/queries/useAccessManagementQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface Organization {
  id: string;
  name: string;
  parentId?: string;
  subOrganizations?: Organization[];
}

// ── Tree Node Component ──
const OrgTreeNode: React.FC<{
  org: Organization;
  level: number;
  theme: MD3Theme;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
}> = ({ org, level, theme, expandedIds, toggleExpand }) => {
  const hasChildren = org.subOrganizations && org.subOrganizations.length > 0;
  const isExpanded = expandedIds.has(org.id);

  const levelColors = [
    anypointColors.mulePurple,
    anypointColors.primary,
    anypointColors.secondary,
    anypointColors.accent,
    anypointColors.warning,
  ];
  const nodeColor = levelColors[level % levelColors.length];

  return (
    <View>
      <Pressable
        onPress={() => {
          if (hasChildren) {
            hapticLight();
            toggleExpand(org.id);
          }
        }}
        android_ripple={hasChildren ? { color: theme.colors.primaryContainer } : undefined}
        accessibilityLabel={`${org.name}, level ${level + 1}`}
        accessibilityRole={hasChildren ? 'button' : 'text'}
        accessibilityHint={hasChildren ? 'Double tap to expand or collapse' : undefined}
        style={({ pressed }) => [
          {
            marginBottom: 4,
            marginLeft: level * 20,
            borderRadius: 14,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            overflow: 'hidden',
            opacity: pressed && hasChildren ? 0.92 : 1,
          },
        ]}
      >
        {/* Left accent */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: 1.5,
            backgroundColor: nodeColor,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 14,
            paddingLeft: 16,
            gap: 10,
          }}
        >
          {/* Expand/collapse icon */}
          {hasChildren ? (
            <Icon
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          ) : (
            <View style={{ width: 18 }} />
          )}

          {/* Org icon */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: nodeColor + '14',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon name="domain" size={16} color={nodeColor} />
          </View>

          {/* Name and ID */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: theme.colors.onSurface,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {org.name}
            </Text>
          </View>

          {/* ID badge */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              backgroundColor: theme.colors.surfaceVariant,
              maxWidth: 100,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                color: theme.colors.onSurfaceVariant,
                fontWeight: '500',
                fontFamily: 'monospace',
              }}
              numberOfLines={1}
            >
              {org.id.substring(0, 12)}...
            </Text>
          </View>

          {/* Child count badge */}
          {hasChildren && (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: nodeColor + '14',
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: nodeColor }}>
                {org.subOrganizations!.length}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Children (recursion) */}
      {hasChildren && isExpanded && (
        <View>
          {org.subOrganizations!.map((child) => (
            <OrgTreeNode
              key={child.id}
              org={child}
              level={level + 1}
              theme={theme}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ── Main Screen ──
const BusinessGroupsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: groups, isLoading, error, refetch } = useBusinessGroups();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const orgTree = useMemo(() => {
    if (!groups) return [];
    // If it's a single root org, wrap in array; if array, use directly
    if (Array.isArray(groups)) return groups as Organization[];
    return [groups] as Organization[];
  }, [groups]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (isLoading) return <LoadingState message="Loading business groups..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Business Groups" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {orgTree.length === 0 ? (
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
              <Icon name="domain" size={36} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
              No business groups
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              No organization hierarchy found.
            </Text>
          </View>
        ) : (
          orgTree.map((org) => (
            <OrgTreeNode
              key={org.id}
              org={org}
              level={0}
              theme={theme}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
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

export default BusinessGroupsScreen;
