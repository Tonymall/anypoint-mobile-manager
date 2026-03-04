// ============================================================
// Application Logs Screen - CloudHub log viewer
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Platform } from 'react-native';
import { Appbar, Text, Chip, Searchbar, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAppLogs } from '../../hooks/queries';
import type { AppLogEntry } from '../../types';
import LoadingState from '../../components/common/LoadingState';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type PriorityFilter = 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const PRIORITY_FILTERS: PriorityFilter[] = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];

const PRIORITY_COLORS: Record<AppLogEntry['priority'], string> = {
  ERROR: '#F44336',
  WARN: '#FF9800',
  INFO: '#2196F3',
  DEBUG: '#9E9E9E',
  FATAL: '#D32F2F',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTimestamp(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  if (isToday(d)) {
    return `${hh}:${mm}:${ss}`;
  }

  const mon = MONTH_ABBR[d.getMonth()];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mon} ${dd} ${hh}:${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Log Entry Component
// ---------------------------------------------------------------------------

interface LogEntryItemProps {
  entry: AppLogEntry;
  theme: MD3Theme;
}

const LogEntryItem = React.memo<LogEntryItemProps>(({ entry, theme }) => {
  const styles = useMemo(() => createEntryStyles(theme), [theme]);
  const badgeColor = PRIORITY_COLORS[entry.priority] ?? '#9E9E9E';

  return (
    <View style={styles.entryContainer}>
      <View style={styles.entryHeader}>
        <View style={[styles.priorityBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.priorityText}>{entry.priority}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(entry.timestamp)}</Text>
      </View>

      <Text style={styles.message} selectable>
        {entry.message}
      </Text>

      {entry.threadName ? (
        <Text style={styles.threadName}>{entry.threadName}</Text>
      ) : null}
    </View>
  );
});

LogEntryItem.displayName = 'LogEntryItem';

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const LogsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // State
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Build query params for the API
  const queryParams = useMemo(() => {
    const params: { priority?: string; limit?: number } = { limit: 200 };
    if (priorityFilter !== 'ALL') {
      params.priority = priorityFilter;
    }
    return params;
  }, [priorityFilter]);

  // Fetch logs
  const {
    data: logsResponse,
    isLoading,
    isRefetching,
    refetch,
  } = useAppLogs(domain as string, queryParams);

  const logs = logsResponse?.data ?? [];

  // Client-side search filtering
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const query = searchQuery.toLowerCase();
    return logs.filter(
      (entry) =>
        entry.message.toLowerCase().includes(query) ||
        (entry.threadName && entry.threadName.toLowerCase().includes(query)) ||
        (entry.loggerName && entry.loggerName.toLowerCase().includes(query)),
    );
  }, [logs, searchQuery]);

  // Callbacks
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleFilterPress = useCallback((filter: PriorityFilter) => {
    setPriorityFilter(filter);
  }, []);

  const keyExtractor = useCallback(
    (item: AppLogEntry, index: number) => `${item.timestamp}-${index}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: AppLogEntry }) => (
      <LogEntryItem entry={item} theme={theme} />
    ),
    [theme],
  );

  // Empty state
  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text variant="titleMedium" style={styles.emptyTitle}>
          No logs found
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try adjusting your search query or filters.'
            : 'No log entries match the selected priority filter.'}
        </Text>
      </View>
    );
  }, [isLoading, searchQuery, styles]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application Logs" />
        </Appbar.Header>
        <LoadingState message="Loading logs..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Application Logs" />
      </Appbar.Header>

      {/* Priority filter chips */}
      <View style={styles.filterRow}>
        {PRIORITY_FILTERS.map((filter) => {
          const isSelected = priorityFilter === filter;
          const chipColor =
            filter === 'ALL' ? theme.colors.primary : PRIORITY_COLORS[filter as AppLogEntry['priority']];
          return (
            <Chip
              key={filter}
              mode={isSelected ? 'flat' : 'outlined'}
              selected={isSelected}
              onPress={() => handleFilterPress(filter)}
              compact
              style={[
                styles.filterChip,
                isSelected && { backgroundColor: chipColor },
              ]}
              textStyle={[
                styles.filterChipText,
                isSelected && { color: '#FFFFFF' },
              ]}
            >
              {filter}
            </Chip>
          );
        })}
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search log messages..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={theme.colors.onSurfaceVariant}
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />
      </View>

      {/* Log entries list */}
      <FlatList
        data={filteredLogs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={filteredLogs.length === 0 ? styles.emptyListContent : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={30}
        maxToRenderPerBatch={20}
        windowSize={11}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles — Screen
// ---------------------------------------------------------------------------

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 6,
    },
    filterChip: {
      borderColor: theme.colors.outline,
    },
    filterChipText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    searchContainer: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    searchBar: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      height: 40,
    },
    searchInput: {
      fontSize: 14,
      minHeight: 40,
    },
    listContent: {
      paddingBottom: 24,
    },
    emptyListContent: {
      flexGrow: 1,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 80,
    },
    emptyTitle: {
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    emptySubtitle: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });

// ---------------------------------------------------------------------------
// Styles — Log Entry
// ---------------------------------------------------------------------------

const createEntryStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    entryContainer: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.surface,
    },
    entryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
      gap: 8,
    },
    priorityBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      minWidth: 44,
      alignItems: 'center',
    },
    priorityText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    timestamp: {
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    message: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.onSurface,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    threadName: {
      fontSize: 10,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
  });

export default LogsScreen;
