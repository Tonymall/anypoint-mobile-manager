// ============================================================
// Logs Screen — Two tabs:
//   1) App Logs   → CloudHub runtime logs (auto-polling live feed)
//   2) Audit Logs → Anypoint Platform audit trail
// ============================================================

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Platform, ScrollView,
} from 'react-native';
import {
  Appbar, Text, Chip, Searchbar, useTheme, ActivityIndicator, Switch,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuditLogs } from '../../hooks/queries';
import * as runtimeService from '../../services/runtimeService';
import { areLogEndpointsAvailable } from '../../services/runtimeService';
import type { AuditLogEntry } from '../../types';
import type { AuditLogQueryParams } from '../../services/auditLogService';
import LoadingState from '../../components/common/LoadingState';

// ---------------------------------------------------------------------------
// Date-range presets
// ---------------------------------------------------------------------------

interface DateRange { label: string; ms: number }

const DATE_RANGES: DateRange[] = [
  { label: '1h',  ms: 3_600_000 },
  { label: '4h',  ms: 14_400_000 },
  { label: '12h', ms: 43_200_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '3d',  ms: 259_200_000 },
  { label: '7d',  ms: 604_800_000 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  ERROR: '#F44336', FATAL: '#B71C1C', WARN: '#FF9800',
  INFO: '#2196F3', DEBUG: '#9E9E9E', SYSTEM: '#7E57C2',
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtTs(raw: string | number): string {
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  if (d.toDateString() === new Date().toDateString()) return `${hh}:${mm}:${ss}`;
  return `${MONTH_ABBR[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')} ${hh}:${mm}`;
}

// ═══════════════════════════════════════════════════════════════════
// App Log Item
// ═══════════════════════════════════════════════════════════════════

const AppLogItem = React.memo<{ entry: any; theme: MD3Theme }>(({ entry, theme }) => {
  const priority = (entry.priority ?? entry.level ?? 'INFO').toUpperCase();
  const priColor = PRIORITY_COLORS[priority] ?? '#9E9E9E';
  const message = entry.message ?? entry.msg ?? entry.line ?? JSON.stringify(entry);
  const ts = entry.timestamp ?? entry.instant ?? entry.date ?? '';

  return (
    <View style={{
      paddingHorizontal: 12, paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <View style={{
          paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
          backgroundColor: priColor + '20',
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: priColor }}>{priority}</Text>
        </View>
        <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
          {fmtTs(ts)}
        </Text>
      </View>
      <Text
        style={{ fontSize: 12, color: theme.colors.onSurface, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 18 }}
        selectable
      >
        {typeof message === 'string' ? message : JSON.stringify(message)}
      </Text>
    </View>
  );
});
AppLogItem.displayName = 'AppLogItem';

// ═══════════════════════════════════════════════════════════════════
// Audit Log Item
// ═══════════════════════════════════════════════════════════════════

function getActionIcon(action: string): string {
  const l = action.toLowerCase();
  if (l.includes('deploy') || l.includes('redeploy')) return 'rocket-launch';
  if (l.includes('create')) return 'plus-circle-outline';
  if (l.includes('update') || l.includes('modify')) return 'pencil-outline';
  if (l.includes('delete')) return 'delete-outline';
  if (l.includes('login')) return 'login';
  if (l.includes('start')) return 'play-circle-outline';
  if (l.includes('stop')) return 'stop-circle-outline';
  if (l.includes('restart')) return 'restart';
  return 'information-outline';
}

function getActionColor(action: string): string {
  const l = action.toLowerCase();
  if (l.includes('delete') || l.includes('stop')) return '#F44336';
  if (l.includes('create') || l.includes('deploy') || l.includes('start')) return '#4CAF50';
  if (l.includes('update') || l.includes('modify') || l.includes('restart')) return '#FF9800';
  return '#9E9E9E';
}

const AuditLogItem = React.memo<{ entry: AuditLogEntry; theme: MD3Theme }>(({ entry, theme }) => {
  const color = getActionColor(entry.action);
  const icon = getActionIcon(entry.action);
  return (
    <View style={{
      paddingHorizontal: 12, paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: color + '20', justifyContent: 'center', alignItems: 'center' }}>
          <Icon name={icon} size={14} color={color} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.onSurface }} numberOfLines={1}>
          {entry.action}
        </Text>
        <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
          {fmtTs(entry.timestamp)}
        </Text>
      </View>
      {entry.objectType ? (
        <View style={{ flexDirection: 'row', gap: 4, marginLeft: 34 }}>
          <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}>{entry.objectType}</Text>
          {entry.objectId ? <Text style={{ fontSize: 11, color: theme.colors.onSurface, fontWeight: '500', flex: 1 }} numberOfLines={1}>· {entry.objectId}</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 34, gap: 3, marginTop: 2 }}>
        <Icon name="account-outline" size={11} color={theme.colors.onSurfaceVariant} />
        <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>{entry.userName || 'System'}</Text>
        {entry.environmentName ? (
          <>
            <Text style={{ fontSize: 10, color: theme.colors.outline }}> · </Text>
            <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>{entry.environmentName}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
});
AuditLogItem.displayName = 'AuditLogItem';

// ═══════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════

const LogsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const flatListRef = useRef<FlatList>(null);

  // State
  const [tab, setTab] = useState<'app' | 'audit'>('app');
  const [dateIdx, setDateIdx] = useState(3); // 24h default
  const [searchQuery, setSearchQuery] = useState('');
  const [liveMode, setLiveMode] = useState(true); // Auto-polling toggle

  const dateRange = useMemo(() => {
    const now = new Date();
    return {
      startDate: new Date(now.getTime() - DATE_RANGES[dateIdx].ms).toISOString(),
      endDate: now.toISOString(),
    };
  }, [dateIdx]);

  // ---- App Logs (CloudHub) — with auto-polling for live feed ----
  const {
    data: appLogs,
    isLoading: appLogsLoading,
    isRefetching: appLogsRefetching,
    refetch: refetchAppLogs,
    error: appLogsError,
    isFetched: appLogsFetched,
  } = useQuery({
    queryKey: ['appLogs', domain, dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      runtimeService.getAppLogs(domain!, {
        startDate: dateRange.startDate,
        endDate: new Date().toISOString(), // always use current time for endDate
        limit: 200,
      }),
    enabled: !!domain,
    retry: 1,
    // Auto-poll every 5 seconds when live mode is on and the app logs tab is active
    // BUT only if log endpoints haven't been permanently disabled (all returned 400/404/405)
    refetchInterval: liveMode && tab === 'app' && areLogEndpointsAvailable() ? 5_000 : false,
  });

  // ---- Audit Logs — always fetch ----
  const auditParams = useMemo<AuditLogQueryParams>(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 100,
  }), [dateRange]);

  const {
    data: auditResponse,
    isLoading: auditLoading,
    isRefetching: auditRefetching,
    refetch: refetchAudit,
    error: auditError,
    isFetched: auditFetched,
  } = useAuditLogs(auditParams);

  // Auto-switch to audit tab if app logs come back empty
  useEffect(() => {
    if (appLogsFetched && (!appLogs || appLogs.length === 0) && tab === 'app') {
      // If audit logs have data, auto-switch
      if (auditFetched && auditResponse?.data && auditResponse.data.length > 0) {
        setTab('audit');
      }
    }
  }, [appLogsFetched, appLogs, auditFetched, auditResponse, tab]);

  // Filtered data
  const filteredAppLogs = useMemo(() => {
    const logs = appLogs ?? [];
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((l: any) =>
      (l.message ?? l.msg ?? l.line ?? '').toLowerCase().includes(q) ||
      (l.priority ?? l.level ?? '').toLowerCase().includes(q),
    );
  }, [appLogs, searchQuery]);

  const filteredAuditLogs = useMemo(() => {
    const logs = auditResponse?.data ?? [];
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((e) =>
      e.action?.toLowerCase().includes(q) ||
      e.objectType?.toLowerCase().includes(q) ||
      e.objectId?.toLowerCase().includes(q) ||
      e.userName?.toLowerCase().includes(q),
    );
  }, [auditResponse, searchQuery]);

  const isLoading = tab === 'app' ? appLogsLoading : auditLoading;
  const isRefetching = tab === 'app' ? appLogsRefetching : auditRefetching;
  const handleRefresh = useCallback(() => {
    refetchAppLogs();
    refetchAudit();
  }, [refetchAppLogs, refetchAudit]);

  // Render items
  const renderAppLog = useCallback(({ item }: { item: any }) => (
    <AppLogItem entry={item} theme={theme} />
  ), [theme]);

  const renderAuditLog = useCallback(({ item }: { item: AuditLogEntry }) => (
    <AuditLogItem entry={item} theme={theme} />
  ), [theme]);

  const keyExtractorApp = useCallback((_item: any, idx: number) => `app-${idx}`, []);
  const keyExtractorAudit = useCallback((item: AuditLogEntry, idx: number) => `${item.id}-${idx}`, []);

  // Empty
  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    const err = tab === 'app' ? appLogsError : auditError;
    return (
      <View style={styles.emptyContainer}>
        <Icon name="text-box-search-outline" size={48} color={theme.colors.outlineVariant} />
        <Text variant="titleMedium" style={styles.emptyTitle}>
          {tab === 'app' ? 'No application logs found' : 'No audit logs found'}
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          {err
            ? `Error: ${(err as Error).message}`
            : tab === 'app'
              ? 'CloudHub runtime logs may not be available for this application or region. Try the Audit Logs tab.'
              : 'No audit events found for the selected time range.'}
        </Text>
        {tab === 'app' && !err && (
          <View style={[styles.hintBox, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Icon name="information-outline" size={16} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1, marginLeft: 8 }}>
              CloudHub 1.0 (EU1) log APIs have limited availability. Logs are fetched from multiple endpoints automatically. If logs appear empty, the app may not have generated any logs in the selected time range.
            </Text>
          </View>
        )}
      </View>
    );
  }, [isLoading, tab, appLogsError, auditError, styles, theme]);

  // Loading
  if (appLogsLoading && auditLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header><Appbar.BackAction onPress={() => router.back()} /><Appbar.Content title="Logs" /></Appbar.Header>
        <LoadingState message="Loading logs..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Logs" subtitle={domain ? `App: ${domain}` : undefined} />
        <Appbar.Action icon="refresh" onPress={handleRefresh} />
      </Appbar.Header>

      {/* Tab selector — using Chip row (works in all RN Paper versions) */}
      <View style={styles.tabRow}>
        <Chip
          icon="console-line"
          selected={tab === 'app'}
          onPress={() => setTab('app')}
          mode={tab === 'app' ? 'flat' : 'outlined'}
          style={[styles.tabChip, tab === 'app' && { backgroundColor: theme.colors.primary }]}
          textStyle={tab === 'app' ? { color: '#fff' } : undefined}
          selectedColor={tab === 'app' ? '#fff' : undefined}
        >
          App Logs {appLogs && appLogs.length > 0 ? `(${appLogs.length})` : ''}
        </Chip>
        <Chip
          icon="shield-search"
          selected={tab === 'audit'}
          onPress={() => setTab('audit')}
          mode={tab === 'audit' ? 'flat' : 'outlined'}
          style={[styles.tabChip, tab === 'audit' && { backgroundColor: theme.colors.primary }]}
          textStyle={tab === 'audit' ? { color: '#fff' } : undefined}
          selectedColor={tab === 'audit' ? '#fff' : undefined}
        >
          Audit Logs {auditResponse?.data && auditResponse.data.length > 0 ? `(${auditResponse.data.length})` : ''}
        </Chip>
      </View>

      {/* Live feed toggle + Date range */}
      <View style={styles.dateRow}>
        {tab === 'app' && (
          <View style={styles.liveFeedToggle}>
            <View style={[
              styles.liveDot,
              { backgroundColor: liveMode ? '#4CAF50' : theme.colors.outlineVariant },
            ]} />
            <Text variant="labelSmall" style={{
              color: liveMode ? '#4CAF50' : theme.colors.onSurfaceVariant,
              fontWeight: '700',
              marginRight: 4,
            }}>
              LIVE
            </Text>
            <Switch
              value={liveMode}
              onValueChange={setLiveMode}
              style={{ transform: [{ scale: 0.7 }], marginRight: -4 }}
            />
          </View>
        )}
        {tab === 'app' && isRefetching && (
          <ActivityIndicator size={12} color={theme.colors.primary} style={{ marginRight: 4 }} />
        )}
        <Icon name="clock-outline" size={15} color={theme.colors.onSurfaceVariant} style={{ marginRight: 4 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
          {DATE_RANGES.map((dr, i) => {
            const sel = dateIdx === i;
            return (
              <Chip
                key={dr.label}
                mode={sel ? 'flat' : 'outlined'}
                selected={sel}
                onPress={() => setDateIdx(i)}
                compact
                style={[styles.dateChip, sel && { backgroundColor: theme.colors.primaryContainer }]}
                textStyle={sel ? { color: theme.colors.onPrimaryContainer, fontWeight: '700' } : { color: theme.colors.onSurfaceVariant }}
              >
                {dr.label}
              </Chip>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Searchbar
          placeholder={tab === 'app' ? 'Search log messages...' : 'Search actions, users...'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {/* List */}
      {tab === 'app' ? (
        <FlatList
          ref={flatListRef}
          data={filteredAppLogs}
          keyExtractor={keyExtractorApp}
          renderItem={renderAppLog}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={filteredAppLogs.length === 0 ? styles.emptyList : styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching && !liveMode} onRefresh={handleRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
        />
      ) : (
        <FlatList
          data={filteredAuditLogs}
          keyExtractor={keyExtractorAudit}
          renderItem={renderAuditLog}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={filteredAuditLogs.length === 0 ? styles.emptyList : styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
const makeStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 8 },
    tabChip: { borderColor: theme.colors.outline },
    dateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
    dateChip: { borderColor: theme.colors.outline },
    searchWrap: { paddingHorizontal: 12, paddingVertical: 6 },
    searchBar: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, height: 40 },
    searchInput: { fontSize: 14, minHeight: 40 },
    listContent: { paddingBottom: 24 },
    emptyList: { flexGrow: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
    emptyTitle: { color: theme.colors.onSurface, marginTop: 12, marginBottom: 8 },
    emptySubtitle: { color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 },
    hintBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 10, maxWidth: 340 },
    liveFeedToggle: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  });

export default LogsScreen;
