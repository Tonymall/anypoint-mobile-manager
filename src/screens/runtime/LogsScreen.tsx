// ═══════════════════════════════════════════════════════════════════
// Logs Screen — card-based log viewer
//   1) App Logs   → CloudHub runtime logs (auto-polling live feed)
//   2) Audit Logs → Anypoint Platform audit trail
//
// Chrome is deliberately thin. Everything above the first log line is
// one header (back, title, live state, refresh) plus one control bar
// (feed switch, search, filter button) — level, time range and the
// live/auto-scroll switches live in a sheet behind the filter button.
// Nothing was dropped; it is progressive disclosure, so the list gets
// the viewport instead of six stacked rows of controls.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Platform,
  Modal, Pressable, ScrollView, useWindowDimensions,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuditLogs } from '../../hooks/queries';
import * as runtimeService from '../../services/runtimeService';
import { areLogEndpointsAvailable } from '../../services/runtimeService';
import type { AuditLogEntry } from '../../types';
import type { AuditLogQueryParams } from '../../services/auditLogService';
import LoadingState from '../../components/common/LoadingState';
import logger from '../../utils/logger';
import type { IconName } from '../../types/icons';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { hapticSelection } from '../../utils/haptics';
import {
  LogMessage,
  LogControlBar,
  LogFilterSheet,
  activeFilterCount,
  DATE_RANGES,
  DEFAULT_LEVEL,
  DEFAULT_RANGE_INDEX,
  auditActionRole,
  priorityRole,
  type LogLevel,
  type LogTab,
} from './logs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getEntryPriority(entry: any): string {
  const ev = entry?.event;
  const rawPriority = String(
    entry?.priority ??
    ev?.priority ??
    entry?.level ??
    ev?.level ??
    entry?.severity ??
    entry?.logLevel ??
    'INFO',
  ).toUpperCase();

  if (rawPriority && rawPriority !== 'INFO') {
    return rawPriority === 'WARNING' ? 'WARN' : rawPriority;
  }

  const message = String(entry?.message ?? ev?.message ?? entry?.msg ?? entry?.line ?? '');
  const inferredPriority = message.match(/\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\b/i)?.[1]?.toUpperCase();
  if (inferredPriority) {
    return inferredPriority === 'WARNING' ? 'WARN' : inferredPriority;
  }

  return 'INFO';
}

// ═══════════════════════════════════════════════════════════════════
// App Log Card
// ═══════════════════════════════════════════════════════════════════

const AppLogCard = React.memo<{
  entry: any;
  t: Tokens;
  onPress: (entry: any) => void;
}>(({ entry, t, onPress }) => {
  const priority = getEntryPriority(entry);
  const role: StatusRole = priorityRole(t, priority);

  // Extract message — handle nested event wrapper from CH1
  const ev = entry.event;
  const rawMessage = entry.message ?? ev?.message ?? entry.msg ?? (typeof entry.line === 'string' ? entry.line : '') ?? '';
  const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
  const ts = entry.timestamp ?? ev?.timestamp ?? entry.instant ?? entry.date ?? '';
  const docId = entry.recordId ?? entry.docId ?? entry.id ?? '';
  const loggerName = entry.loggerName ?? ev?.loggerName ?? entry.logger ?? '';

  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityLabel={`${priority} log: ${message ? message.slice(0, 80) : 'log entry'}. ${fmtTs(ts)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view full details"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.color.surface.raised,
            borderColor: t.color.border.subtle,
          },
        ]}
      >
        <View style={styles.cardBody}>
          {/* Message — JSON/XML payloads render as collapsible blocks */}
          <LogMessage message={message} />

          {loggerName ? (
            <Text
              style={[
                styles.mono,
                { color: t.color.text.tertiary, fontFamily: t.monoFontFamily },
              ]}
              numberOfLines={1}
            >
              {loggerName}
            </Text>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.cardFooterLeft}>
              {docId ? (
                <Text
                  style={[
                    styles.mono,
                    { color: t.color.text.tertiary, fontFamily: t.monoFontFamily },
                  ]}
                  numberOfLines={1}
                >
                  Pos: {docId}
                </Text>
              ) : null}
            </View>
            <View style={styles.cardFooterRight}>
              <View style={[styles.levelBadge, { backgroundColor: role.surface }]}>
                <Text style={[styles.levelBadgeText, { color: role.base }]}>
                  {priority}
                </Text>
              </View>
              <View style={styles.timestamp}>
                <Text style={[typeScale.caption, { color: t.color.text.accent }]}>
                  {fmtTs(ts)}
                </Text>
                {ts ? (
                  <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>
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
  t: Tokens;
}> = ({ entry, visible, onDismiss, t }) => {
  if (!entry) return null;

  const jsonStr = JSON.stringify(entry, null, 2);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.sheetWrap}>
        <Pressable
          style={[styles.sheetBackdrop, { backgroundColor: withAlpha(t.color.shadow, 0.45) }]}
          onPress={onDismiss}
          accessibilityLabel="Close log details"
          accessibilityRole="button"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: t.color.border.subtle }]}>
            <Text style={[typeScale.heading, { color: t.color.text.primary }]}>
              Log Details
            </Text>
            <Pressable
              onPress={onDismiss}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close log details"
            >
              <Icon name="close" size={20} color={t.color.text.tertiary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator>
            <Text
              style={[
                styles.detailText,
                { color: t.color.text.secondary, fontFamily: t.monoFontFamily },
              ]}
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

function getActionIcon(action: string): IconName {
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

const AuditLogItem = React.memo<{ entry: AuditLogEntry; t: Tokens }>(({ entry, t }) => {
  const role = auditActionRole(t, entry.action);
  const icon = getActionIcon(entry.action);
  return (
    <View style={[styles.auditRow, { borderBottomColor: t.color.border.subtle }]}>
      <View style={styles.auditTop}>
        <View style={[styles.auditIcon, { backgroundColor: role.surface }]}>
          <Icon name={icon} size={14} color={role.base} />
        </View>
        <Text
          style={[styles.auditAction, { color: t.color.text.primary }]}
          numberOfLines={1}
        >
          {entry.action}
        </Text>
        <Text
          style={[typeScale.micro, { color: t.color.text.tertiary, fontFamily: t.monoFontFamily }]}
        >
          {fmtTs(entry.timestamp)}
        </Text>
      </View>
      {entry.objectType ? (
        <View style={styles.auditMetaRow}>
          <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
            {entry.objectType}
          </Text>
          {entry.objectId ? (
            <Text
              style={[styles.auditObjectId, { color: t.color.text.secondary }]}
              numberOfLines={1}
            >
              · {entry.objectId}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.auditUserRow}>
        <Icon name="account-outline" size={11} color={t.color.text.tertiary} />
        <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>
          {entry.userName || 'System'}
        </Text>
        {entry.environmentName ? (
          <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>
            {` · ${entry.environmentName}`}
          </Text>
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
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);

  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;
  const headerTopPadding = Math.max(insets.top, Platform.OS === 'android' ? 12 : 16);

  // ── Debug: log domain on mount ──
  useEffect(() => {
    logger.log(`[LogsScreen] Mounted with domain="${domain}"`);
  }, [domain]);

  // State
  const [tab, setTab] = useState<LogTab>('app');
  const [dateIdx, setDateIdx] = useState(DEFAULT_RANGE_INDEX);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel>(DEFAULT_LEVEL);
  const [liveMode, setLiveMode] = useState(true); // Auto-polling toggle
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);

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
    queryKey: ['appLogs', domain, dateRange.startDate, dateRange.endDate, logLimit],
    queryFn: () =>
      runtimeService.getAppLogs(domain!, {
        startDate: dateRange.startDate,
        endDate: new Date().toISOString(), // always use current time for endDate
        limit: logLimit,
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
    logger.log(`[LogsScreen] appLogs updated: ${count} entries, isFetched=${appLogsFetched}, error=${appLogsError?.message ?? 'none'}`);
    if (count > 0 && appLogs?.[0]) {
      logger.log('[LogsScreen] First entry keys:', Object.keys(appLogs[0]).join(', '));
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
    isFetched: _auditFetched,
  } = useAuditLogs(auditParams);

  // Filtered data — safely convert everything to string before toLowerCase
  const filteredAppLogs = useMemo(() => {
    const logs = appLogs ?? [];
    return logs.filter((l: any) => {
      const ev = l.event;
      const msg = String(l.message ?? ev?.message ?? l.msg ?? l.line ?? '');
      const pri = getEntryPriority(l);
      const loggerLabel = String(l.loggerName ?? ev?.loggerName ?? l.logger ?? '');
      const thread = String(l.threadName ?? ev?.threadName ?? '');

      // Level filter
      if (levelFilter !== 'ALL' && pri !== levelFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          msg.toLowerCase().includes(q) ||
          pri.toLowerCase().includes(q) ||
          loggerLabel.toLowerCase().includes(q) ||
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
      const pri = getEntryPriority(l);
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
    <AppLogCard entry={item} t={t} onPress={handleLogPress} />
  ), [t, handleLogPress]);

  const renderAuditLog = useCallback(({ item }: { item: AuditLogEntry }) => (
    <AuditLogItem entry={item} t={t} />
  ), [t]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll trigger only needs dataUpdatedAt, autoScroll, tab; filteredAppLogs.length is derived
  }, [dataUpdatedAt, autoScroll, tab]);

  // Empty
  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <LoadingState
            fullScreen={false}
            size="large"
            message={tab === 'app' ? 'Loading application logs...' : 'Loading audit logs...'}
          />
        </View>
      );
    }
    const err = tab === 'app' ? appLogsError : auditError;
    return (
      <View style={styles.emptyContainer}>
        <Icon name="text-box-search-outline" size={48} color={t.color.border.strong} />
        <Text style={[styles.emptyTitle, { color: t.color.text.primary }]}>
          {tab === 'app' ? 'No application logs found' : 'No audit logs found'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: t.color.text.secondary }]}>
          {err
            ? `Error: ${(err as Error).message}`
            : tab === 'app'
              ? 'Runtime logs may not be available for this application or region. Try the Audit Logs tab.'
              : 'No audit events found for the selected time range.'}
        </Text>
        {tab === 'app' && !err && (
          <View style={[styles.hintBox, { backgroundColor: t.color.surface.sunken }]}>
            <Icon name="information-outline" size={16} color={t.color.text.tertiary} />
            <Text style={[styles.hintText, { color: t.color.text.secondary }]}>
              Log APIs are tried across CloudHub 1.0, CloudHub 2.0, and Runtime Fabric automatically. If logs appear empty, the app may not have generated any logs in the selected time range, or log access may require an Anypoint Monitoring subscription.
            </Text>
          </View>
        )}
      </View>
    );
  }, [isLoading, tab, appLogsError, auditError, t]);

  const totalLogs = tab === 'app' ? (appLogs?.length ?? 0) : (auditResponse?.data?.length ?? 0);
  const appCount = appLogs?.length ?? 0;
  const auditCount = auditResponse?.data?.length ?? 0;
  const activeCount = activeFilterCount(tab === 'app' ? levelFilter : DEFAULT_LEVEL, dateIdx);
  const isLive = liveMode && areLogEndpointsAvailable();
  const liveRole = isLive ? t.color.status.success : t.color.status.neutral;

  const handleResetFilters = useCallback(() => {
    setLevelFilter(DEFAULT_LEVEL);
    setDateIdx(DEFAULT_RANGE_INDEX);
  }, []);

  // Loading
  if (appLogsLoading && auditLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        <View style={[styles.header, { paddingTop: headerTopPadding, borderBottomColor: t.color.border.subtle }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="arrow-left" size={22} color={t.color.text.primary} />
          </Pressable>
          <Text style={[typeScale.title, { color: t.color.text.primary, marginLeft: spacing.md }]}>
            Logs
          </Text>
        </View>
        <LoadingState message="Loading logs..." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* ── Header: back, title, live state, refresh ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: headerTopPadding,
            borderBottomColor: t.color.border.subtle,
            backgroundColor: t.color.surface.canvas,
          },
          isWide && { paddingHorizontal: sidePadding + spacing.md },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={22} color={t.color.text.primary} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={[typeScale.heading, { color: t.color.text.primary }]} numberOfLines={1}>
            Logs
          </Text>
          <Text style={[typeScale.micro, { color: t.color.text.tertiary }]} numberOfLines={1}>
            {[
              domain ?? 'Unknown',
              `${totalLogs} entries`,
              lastUpdated ? `updated ${fmtTimeOnly(lastUpdated.getTime())}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        {tab === 'app' ? (
          <Pressable
            onPress={() => {
              hapticSelection();
              setLiveMode((prev) => !prev);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isLive }}
            accessibilityLabel={liveMode ? 'Pause live log updates' : 'Resume live log updates'}
            style={[styles.livePill, { backgroundColor: liveRole.surface }]}
          >
            <View style={[styles.liveDot, { backgroundColor: liveRole.base }]} />
            <Text style={[typeScale.micro, { color: liveRole.base }]}>
              {isLive ? 'LIVE' : 'PAUSED'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleRefresh}
          hitSlop={10}
          disabled={isRefetching}
          accessibilityRole="button"
          accessibilityLabel="Refresh logs"
          style={styles.headerAction}
        >
          {isRefetching ? (
            <ActivityIndicator size={16} color={t.color.text.accent} />
          ) : (
            <Icon name="refresh" size={20} color={t.color.text.secondary} />
          )}
        </Pressable>
      </View>

      {/* ── One control bar: feed switch, search, filters ── */}
      <View
        style={[
          styles.controlBarWrap,
          { backgroundColor: t.color.surface.canvas, borderBottomColor: t.color.border.subtle },
          isWide && { paddingHorizontal: sidePadding },
        ]}
      >
        <LogControlBar
          tab={tab}
          onTabChange={setTab}
          appCount={appCount}
          auditCount={auditCount}
          search={searchQuery}
          onSearchChange={setSearchQuery}
          level={levelFilter}
          onClearLevel={() => setLevelFilter(DEFAULT_LEVEL)}
          rangeIndex={dateIdx}
          onClearRange={() => setDateIdx(DEFAULT_RANGE_INDEX)}
          activeCount={activeCount}
          onOpenFilters={() => setFiltersVisible(true)}
        />
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
          refreshControl={<RefreshControl refreshing={isRefetching && !liveMode} onRefresh={handleRefresh} tintColor={t.color.brand.base} colors={[t.color.brand.base]} />}
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
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={t.color.brand.base} colors={[t.color.brand.base]} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
        />
      )}

      {/* ── Filter sheet: level, time range, feed switches ── */}
      <LogFilterSheet
        visible={filtersVisible}
        onDismiss={() => setFiltersVisible(false)}
        showLevels={tab === 'app'}
        level={levelFilter}
        onLevelChange={setLevelFilter}
        levelCounts={levelCounts}
        totalCount={appCount}
        rangeIndex={dateIdx}
        onRangeChange={setDateIdx}
        showFeedControls={tab === 'app'}
        liveMode={liveMode}
        onLiveModeChange={setLiveMode}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onReset={handleResetFilters}
        canReset={activeCount > 0}
      />

      {/* ── Log Detail Bottom Sheet ── */}
      <LogDetailSheet
        entry={detailEntry}
        visible={detailVisible}
        onDismiss={() => setDetailVisible(false)}
        t={t}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleWrap: { flex: 1 },
  headerAction: {
    width: 24,
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: radii.pill },

  // Control bar
  controlBarWrap: {
    paddingTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // App log card
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  cardBody: { padding: spacing.md },
  mono: { ...typeScale.micro, fontWeight: '400', marginBottom: spacing.xs },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardFooterLeft: { flex: 1, marginRight: spacing.sm },
  cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  levelBadgeText: { ...typeScale.micro, fontWeight: '700' },
  timestamp: { alignItems: 'flex-end' },

  // Audit row
  auditRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  auditTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  auditIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  auditAction: { ...typeScale.bodySmall, fontWeight: '600', flex: 1 },
  auditMetaRow: { flexDirection: 'row', gap: spacing.xs, marginLeft: 34 },
  auditObjectId: { ...typeScale.caption, fontWeight: '500', flex: 1 },
  auditUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 34,
    gap: 3,
    marginTop: 2,
  },

  // Detail sheet
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '60%',
    borderTopWidth: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetBody: { padding: spacing.lg },
  detailText: { ...typeScale.caption, fontWeight: '400', lineHeight: 20 },

  // List
  listContent: { paddingBottom: spacing.xxl, paddingTop: spacing.xs },
  emptyList: { flexGrow: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 72,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: { ...typeScale.subheading, marginTop: spacing.md, marginBottom: spacing.sm },
  emptySubtitle: { ...typeScale.bodySmall, textAlign: 'center', marginBottom: spacing.lg },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    maxWidth: 340,
  },
  hintText: { ...typeScale.caption, fontWeight: '500', flex: 1, marginLeft: spacing.sm },
});

export default LogsScreen;
