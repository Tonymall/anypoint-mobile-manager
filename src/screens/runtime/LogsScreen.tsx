// ============================================================
// Logs Screen — Muleye-inspired card-based log viewer
//   1) App Logs   → CloudHub runtime logs (auto-polling live feed)
//   2) Audit Logs → Anypoint Platform audit trail
//
// Visual design inspired by the Muleye App:
//   - Status bar with total count + last updated time
//   - Card-based log entries with level badge + timestamp
//   - Auto-scroll toggle
//   - Search field
//   - Tap to see full log details in a bottom sheet
// ============================================================

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Platform, ScrollView,
  Modal, Pressable, useWindowDimensions,
} from 'react-native';
import {
  Appbar, Text, Chip, Searchbar, useTheme, ActivityIndicator, Switch,
  Surface, Button, IconButton,
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
// Date-range presets (ordered from smallest to largest)
// Default: 1h (index 0) — show the latest logs first
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

function fmtTimeOnly(raw: string | number): string {
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDate(raw: string | number): string {
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════════════
// App Log Card — Muleye-inspired card design
// ═══════════════════════════════════════════════════════════════════

const AppLogCard = React.memo<{
  entry: any;
  theme: MD3Theme;
  onPress: (entry: any) => void;
}>(({ entry, theme, onPress }) => {
  const priority = String(entry.priority ?? entry.level ?? entry.severity ?? entry.logLevel ?? 'INFO').toUpperCase();
  const priColor = PRIORITY_COLORS[priority] ?? '#9E9E9E';

  // Extract message — handle nested event wrapper from CH1
  const ev = entry.event;
  const message = entry.message ?? ev?.message ?? entry.msg ?? (typeof entry.line === 'string' ? entry.line : '') ?? '';
  const ts = entry.timestamp ?? ev?.timestamp ?? entry.instant ?? entry.date ?? '';
  const docId = entry.recordId ?? entry.docId ?? entry.id ?? '';
  const loggerName = entry.loggerName ?? ev?.loggerName ?? entry.logger ?? '';

  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityLabel={`${priority} log: ${typeof message === 'string' ? message.slice(0, 80) : 'log entry'}. ${fmtTs(ts)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view full details"
    >
      <View
        style={{
          marginHorizontal: 12,
          marginVertical: 4,
          borderRadius: 16,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        <View style={{ padding: 12 }}>
          {/* Message */}
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.onSurface,
              lineHeight: 19,
              marginBottom: 8,
            }}
            numberOfLines={4}
          >
            {typeof message === 'string' ? message : JSON.stringify(message)}
          </Text>

          {/* Logger name (if present) */}
          {loggerName ? (
            <Text
              style={{
                fontSize: 10,
                color: theme.colors.onSurfaceVariant,
                marginBottom: 4,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              }}
              numberOfLines={1}
            >
              {loggerName}
            </Text>
          ) : null}

          {/* Bottom row: docId on left, timestamp + level on right */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              {docId ? (
                <Text
                  style={{
                    fontSize: 10,
                    color: theme.colors.onSurfaceVariant,
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  }}
                  numberOfLines={1}
                >
                  Pos: {docId}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Level badge */}
              <View style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: priColor + '20',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: priColor }}>{priority}</Text>
              </View>
              {/* Timestamp */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.primary }}>
                  {fmtTs(ts)}
                </Text>
                {ts ? (
                  <Text style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>
                    {fmtDate(ts)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
AppLogCard.displayName = 'AppLogCard';

// ═══════════════════════════════════════════════════════════════════
// Log Details Bottom Sheet
// ═══════════════════════════════════════════════════════════════════

const LogDetailSheet: React.FC<{
  entry: any | null;
  visible: boolean;
  onDismiss: () => void;
  theme: MD3Theme;
}> = ({ entry, visible, onDismiss, theme }) => {
  if (!entry) return null;

  const jsonStr = JSON.stringify(entry, null, 2);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onDismiss} accessibilityLabel="Close log details" accessibilityRole="button" />
        <View style={{
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '60%',
          borderTopWidth: 1,
          borderColor: theme.colors.outlineVariant,
        }}>
          {/* Handle + title */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.outlineVariant,
          }}>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
              Log Details
            </Text>
            <IconButton icon="close" size={20} onPress={onDismiss} />
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            showsVerticalScrollIndicator
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.onSurface,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                lineHeight: 20,
              }}
              selectable
            >
              {jsonStr}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

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

const CONTENT_MAX_WIDTH = 768;

const LogsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const flatListRef = useRef<FlatList>(null);

  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;

  // ── Debug: log domain on mount ──
  useEffect(() => {
    console.log(`[LogsScreen] Mounted with domain="${domain}"`);
  }, [domain]);

  // State
  const [tab, setTab] = useState<'app' | 'audit'>('app');
  const [dateIdx, setDateIdx] = useState(0); // Default to 1h (latest)
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL'); // Log level filter
  const [liveMode, setLiveMode] = useState(true); // Auto-polling toggle
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Log detail bottom sheet
  const [detailEntry, setDetailEntry] = useState<any>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const handleLogPress = useCallback((entry: any) => {
    setDetailEntry(entry);
    setDetailVisible(true);
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    return {
      startDate: new Date(now.getTime() - DATE_RANGES[dateIdx].ms).toISOString(),
      endDate: now.toISOString(),
    };
  }, [dateIdx]);

  // Scale limit based on date range — larger windows need more entries
  const logLimit = DATE_RANGES[dateIdx].ms > 86_400_000 ? 500 : 200;

  // Server-side priority filter — when user selects a specific level, ask the API to filter
  const serverPriority = levelFilter !== 'ALL' ? levelFilter : undefined;

  // ---- App Logs (CloudHub) — with auto-polling for live feed ----
  const {
    data: appLogs,
    isLoading: appLogsLoading,
    isRefetching: appLogsRefetching,
    refetch: refetchAppLogs,
    error: appLogsError,
    isFetched: appLogsFetched,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['appLogs', domain, dateRange.startDate, dateRange.endDate, logLimit, serverPriority ?? 'ALL'],
    queryFn: () =>
      runtimeService.getAppLogs(domain!, {
        startDate: dateRange.startDate,
        endDate: new Date().toISOString(), // always use current time for endDate
        limit: logLimit,
        priority: serverPriority,
      }),
    enabled: !!domain,
    retry: 1,
    // Auto-poll every 5 seconds when live mode is on and the app logs tab is active
    // BUT only if log endpoints haven't been permanently disabled (all returned 400/404/405)
    refetchInterval: liveMode && tab === 'app' && areLogEndpointsAvailable() ? 5_000 : false,
  });

  // ── Debug: log when data changes ──
  useEffect(() => {
    const count = appLogs?.length ?? 0;
    console.log(`[LogsScreen] appLogs updated: ${count} entries, isFetched=${appLogsFetched}, error=${appLogsError?.message ?? 'none'}`);
    if (count > 0 && appLogs?.[0]) {
      console.log('[LogsScreen] First entry keys:', Object.keys(appLogs[0]).join(', '));
      console.log('[LogsScreen] First entry sample:', JSON.stringify(appLogs[0]).slice(0, 300));
    }
    if (count > 0) {
      setLastUpdated(new Date()); // eslint-disable-line react-hooks/set-state-in-effect -- syncs timestamp from query data
    }
  }, [appLogs, appLogsFetched, appLogsError]);

  // Update lastUpdated on refetch
  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt)); // eslint-disable-line react-hooks/set-state-in-effect -- syncs timestamp from query
    }
  }, [dataUpdatedAt]);

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

  // Filtered data — safely convert everything to string before toLowerCase
  const filteredAppLogs = useMemo(() => {
    const logs = appLogs ?? [];
    return logs.filter((l: any) => {
      const ev = l.event;
      const msg = String(l.message ?? ev?.message ?? l.msg ?? l.line ?? '');
      const pri = String(l.priority ?? ev?.priority ?? l.level ?? l.severity ?? l.logLevel ?? 'INFO').toUpperCase();
      const logger = String(l.loggerName ?? ev?.loggerName ?? l.logger ?? '');
      const thread = String(l.threadName ?? ev?.threadName ?? '');

      // Level filter
      if (levelFilter !== 'ALL' && pri !== levelFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          msg.toLowerCase().includes(q) ||
          pri.toLowerCase().includes(q) ||
          logger.toLowerCase().includes(q) ||
          thread.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [appLogs, searchQuery, levelFilter]);

  // Count logs by level for filter badges
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (appLogs ?? []).forEach((l: any) => {
      const ev = l.event;
      const pri = String(l.priority ?? ev?.priority ?? l.level ?? l.severity ?? l.logLevel ?? 'INFO').toUpperCase();
      counts[pri] = (counts[pri] ?? 0) + 1;
    });
    return counts;
  }, [appLogs]);

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
    <AppLogCard entry={item} theme={theme} onPress={handleLogPress} />
  ), [theme, handleLogPress]);

  const renderAuditLog = useCallback(({ item }: { item: AuditLogEntry }) => (
    <AuditLogItem entry={item} theme={theme} />
  ), [theme]);

  // Always append index to key to prevent duplicate key errors
  const keyExtractorApp = useCallback((item: any, idx: number) => {
    const id = item?.recordId ?? item?.docId ?? item?.id ?? '';
    return id ? `${id}-${idx}` : `app-${idx}`;
  }, []);
  const keyExtractorAudit = useCallback((item: AuditLogEntry, idx: number) => `${item.id}-${idx}`, []);

  // Auto-scroll to top when new data arrives (if enabled)
  useEffect(() => {
    if (autoScroll && tab === 'app' && filteredAppLogs.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [dataUpdatedAt, autoScroll, tab]);

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
              ? 'Runtime logs may not be available for this application or region. Try the Audit Logs tab.'
              : 'No audit events found for the selected time range.'}
        </Text>
        {tab === 'app' && !err && (
          <View style={[styles.hintBox, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Icon name="information-outline" size={16} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1, marginLeft: 8 }}>
              Log APIs are tried across CloudHub 1.0, CloudHub 2.0, and Runtime Fabric automatically. If logs appear empty, the app may not have generated any logs in the selected time range, or log access may require an Anypoint Monitoring subscription.
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

  const totalLogs = tab === 'app' ? (appLogs?.length ?? 0) : (auditResponse?.data?.length ?? 0);
  const displayedLogs = tab === 'app' ? filteredAppLogs.length : filteredAuditLogs.length;

  return (
    <View style={styles.container}>
      {/* ── Header Banner (Muleye-style) ── */}
      <View style={[styles.headerBanner, { backgroundColor: theme.colors.primary }, isWide && { paddingHorizontal: sidePadding + 4 }]}>
        <View style={styles.headerBannerTop}>
          <IconButton
            icon="arrow-left"
            iconColor="#fff"
            size={22}
            onPress={() => router.back()}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerBannerTitle}>
              Application Logs
            </Text>
            <Text style={styles.headerBannerSubtitle}>
              {domain ?? 'Unknown'}
            </Text>
          </View>
          {lastUpdated && (
            <View style={styles.updatedBadge}>
              <Icon name="clock-outline" size={12} color="#fff" />
              <Text style={styles.updatedText}>
                Updated {fmtTimeOnly(lastUpdated.getTime())}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Controls row: Auto-scroll + Refresh + Count ── */}
      <View style={[styles.controlsRow, isWide && { paddingHorizontal: sidePadding + 12 }]}>
        {tab === 'app' && (
          <View style={styles.toggleItem}>
            <Icon name="arrow-up" size={12} color={autoScroll ? theme.colors.primary : theme.colors.onSurfaceVariant} />
            <Text variant="labelSmall" style={{ color: autoScroll ? theme.colors.primary : theme.colors.onSurfaceVariant, marginHorizontal: 4 }}>
              Auto-scroll
            </Text>
            <Switch
              value={autoScroll}
              onValueChange={setAutoScroll}
              style={{ transform: [{ scale: 0.6 }], marginHorizontal: -6 }}
            />
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Button
          mode="outlined"
          icon="refresh"
          compact
          onPress={handleRefresh}
          loading={isRefetching}
          style={{ borderRadius: 8, marginRight: 8 }}
          labelStyle={{ fontSize: 12 }}
        >
          Refresh
        </Button>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
            {totalLogs}
          </Text>
          <Text style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>Total</Text>
        </View>
        {lastUpdated && (
          <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
            <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
              {fmtTimeOnly(lastUpdated.getTime())}
            </Text>
            <Text style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>Updated</Text>
          </View>
        )}
      </View>

      {/* ── Tab selector ── */}
      <View style={[styles.tabRow, isWide && { paddingHorizontal: sidePadding + 12 }]}>
        <Chip
          icon="console-line"
          selected={tab === 'app'}
          onPress={() => setTab('app')}
          mode={tab === 'app' ? 'flat' : 'outlined'}
          style={[styles.tabChip, tab === 'app' && { backgroundColor: theme.colors.primary }]}
          textStyle={tab === 'app' ? { color: '#fff' } : undefined}
          selectedColor={tab === 'app' ? '#fff' : undefined}
          accessibilityLabel={`App Logs tab${tab === 'app' ? ', selected' : ''}${appLogs && appLogs.length > 0 ? `, ${appLogs.length} entries` : ''}`}
          accessibilityRole="tab"
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
          accessibilityLabel={`Audit Logs tab${tab === 'audit' ? ', selected' : ''}${auditResponse?.data && auditResponse.data.length > 0 ? `, ${auditResponse.data.length} entries` : ''}`}
          accessibilityRole="tab"
        >
          Audit Logs {auditResponse?.data && auditResponse.data.length > 0 ? `(${auditResponse.data.length})` : ''}
        </Chip>

        {/* Live indicator (app tab only) */}
        {tab === 'app' && liveMode && areLogEndpointsAvailable() && (
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#4CAF50' }}>LIVE</Text>
          </View>
        )}
        {tab === 'app' && (
          <Pressable
            onPress={() => setLiveMode(!liveMode)}
            accessibilityLabel={liveMode ? 'Pause live log updates' : 'Resume live log updates'}
            accessibilityRole="button"
            style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '600',
              color: liveMode ? theme.colors.primary : theme.colors.onSurfaceVariant,
            }}>
              {liveMode ? 'Pause' : 'Resume'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── Search ── */}
      <View style={[styles.searchWrap, isWide && { paddingHorizontal: sidePadding + 12 }]}>
        <Searchbar
          placeholder="Search logs..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* ── Level filter (app logs only) ── */}
      {tab === 'app' && (
        <View style={[styles.dateRow, isWide && { paddingHorizontal: sidePadding + 12 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingRight: 12 }}>
            {(['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const).map((level) => {
              const sel = levelFilter === level;
              // When server-side priority filter is active, only show count for the selected level
              // (other levels' data isn't fetched, so counts would be misleading)
              const count = serverPriority
                ? (level === serverPriority ? (appLogs?.length ?? 0) : 0)
                : (level === 'ALL' ? (appLogs?.length ?? 0) : (levelCounts[level] ?? 0));
              const lvlColor = PRIORITY_COLORS[level] ?? theme.colors.primary;
              return (
                <Chip
                  key={level}
                  mode={sel ? 'flat' : 'outlined'}
                  selected={sel}
                  onPress={() => setLevelFilter(level)}
                  compact
                  style={[
                    styles.dateChip,
                    sel && { backgroundColor: level === 'ALL' ? theme.colors.primaryContainer : lvlColor + '25', borderColor: lvlColor + '50' },
                  ]}
                  textStyle={sel
                    ? { color: level === 'ALL' ? theme.colors.onPrimaryContainer : lvlColor, fontWeight: '700' }
                    : { color: theme.colors.onSurfaceVariant }}
                >
                  {level}{count > 0 ? ` (${count})` : ''}
                </Chip>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Date range ── */}
      <View style={[styles.dateRow, isWide && { paddingHorizontal: sidePadding + 12 }]}>
        {tab === 'app' && isRefetching && (
          <ActivityIndicator size={12} color={theme.colors.primary} style={{ marginRight: 6 }} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingRight: 12 }}>
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

      {/* ── List ── */}
      {tab === 'app' ? (
        <FlatList
          ref={flatListRef}
          data={filteredAppLogs}
          keyExtractor={keyExtractorApp}
          renderItem={renderAppLog}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            filteredAppLogs.length === 0 ? styles.emptyList : styles.listContent,
            isWide && { paddingHorizontal: sidePadding },
          ]}
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
          contentContainerStyle={[
            filteredAuditLogs.length === 0 ? styles.emptyList : styles.listContent,
            isWide && { paddingHorizontal: sidePadding },
          ]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
        />
      )}

      {/* ── Log Detail Bottom Sheet ── */}
      <LogDetailSheet
        entry={detailEntry}
        visible={detailVisible}
        onDismiss={() => setDetailVisible(false)}
        theme={theme}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
const makeStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },

    // Header banner (Muleye-style blue banner)
    headerBanner: {
      paddingTop: Platform.OS === 'ios' ? 50 : 8,
      paddingBottom: 12,
      paddingHorizontal: 4,
    },
    headerBannerTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerBannerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
    },
    headerBannerSubtitle: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.75)',
      marginTop: 1,
    },
    updatedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 8,
    },
    updatedText: {
      fontSize: 10,
      color: '#fff',
      fontWeight: '600',
    },

    // Controls row
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    toggleItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    // Tabs
    tabRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 8,
    },
    tabChip: { borderColor: theme.colors.outline },
    liveIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 8,
    },

    // Date row
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    dateChip: { borderColor: theme.colors.outline },

    // Search
    searchWrap: { paddingHorizontal: 12, paddingVertical: 6 },
    searchBar: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, height: 40 },
    searchInput: { fontSize: 14, minHeight: 40 },

    // List
    listContent: { paddingBottom: 24, paddingTop: 4 },
    emptyList: { flexGrow: 1 },

    // Empty state
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
    emptyTitle: { color: theme.colors.onSurface, marginTop: 12, marginBottom: 8 },
    emptySubtitle: { color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 },
    hintBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 10, maxWidth: 340 },

    // Live dot
    liveDot: { width: 8, height: 8, borderRadius: 4 },
  });

export default LogsScreen;
