import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Switch, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  findPrimaryMetric,
  getMeterDescriptors,
  getUsageReportBundle,
  getUsageReportCategories,
  type UsageReportSection,
} from '../../services/meteringService';
import { anypointColors } from '../../theme';

type RangeOption = '30d' | '90d' | '365d';

function getRangeLabel(range: RangeOption): string {
  switch (range) {
    case '90d':
      return 'Last 90d';
    case '365d':
      return 'Last 12m';
    default:
      return 'Last 30d';
  }
}

function getRangeBounds(range: RangeOption): { from: number; to: number } {
  const to = Date.now();
  const days = range === '365d' ? 365 : range === '90d' ? 90 : 30;
  const from = to - days * 24 * 60 * 60 * 1000;
  return { from, to };
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value == null) return '--';
  if (unit === 'GB') return `${value.toFixed(2)} GB`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function escapeCsvValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(section: UsageReportSection, rows: Array<Record<string, unknown>>): string {
  const headers = ['timestamp', ...section.category.detailColumns];
  const lines = [headers.join(',')];

  for (const row of rows) {
    const line = headers.map((header) => escapeCsvValue((row as Record<string, unknown>)[header])).join(',');
    lines.push(line);
  }

  return lines.join('\n');
}

function buildSummaryCsv(sections: UsageReportSection[]): string {
  const lines = ['category,summary_metric,summary_value,detail_rows,last_updated_at'];
  for (const section of sections) {
    const value = findPrimaryMetric(section.aggregate.data[0] ?? {}, section.category.summaryMetric);
    lines.push([
      escapeCsvValue(section.category.title),
      escapeCsvValue(section.category.summaryMetric),
      escapeCsvValue(value),
      escapeCsvValue(section.detail.data.length),
      escapeCsvValue(section.aggregate.metadata.lastUpdatedAt),
    ].join(','));
  }
  return lines.join('\n');
}

const UsageReportsScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [range, setRange] = useState<RangeOption>('30d');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('runtime-messages');
  const [isExporting, setIsExporting] = useState(false);
  const [detailFilter, setDetailFilter] = useState('');
  const [showOnlyWithData, setShowOnlyWithData] = useState(false);

  const bounds = useMemo(() => getRangeBounds(range), [range]);
  const categories = useMemo(() => getUsageReportCategories(), []);

  const { data: descriptors } = useQuery({
    queryKey: ['metering', 'describe'],
    queryFn: getMeterDescriptors,
  });

  const { data: bundle, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['metering', 'bundle', bounds.from, bounds.to],
    queryFn: () => getUsageReportBundle(bounds.from, bounds.to),
  });

  const visibleSections = useMemo(
    () => showOnlyWithData ? (bundle ?? []).filter((section) => section.detail.data.length > 0 || section.aggregate.data.length > 0) : (bundle ?? []),
    [bundle, showOnlyWithData],
  );
  const selectedSection = useMemo(
    () => visibleSections.find((section) => section.category.id === selectedCategoryId) ?? visibleSections[0] ?? null,
    [selectedCategoryId, visibleSections],
  );
  const filteredDetailRows = useMemo(() => {
    if (!selectedSection) return [];
    if (!detailFilter.trim()) return selectedSection.detail.data;
    const needle = detailFilter.trim().toLowerCase();
    return selectedSection.detail.data.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)),
    );
  }, [detailFilter, selectedSection]);

  const descriptorCount = useMemo(() => {
    if (!descriptors || !selectedSection) return 0;
    const title = selectedSection.category.title.toLowerCase();
    return descriptors.filter((descriptor) => {
      const haystack = `${descriptor.name} ${descriptor.productName ?? ''} ${descriptor.productLabel ?? ''}`.toLowerCase();
      return haystack.includes('runtime')
        || (title.includes('mq') && haystack.includes('mq'))
        || (title.includes('object') && haystack.includes('object_store'))
        || (title.includes('api manager') && haystack.includes('api_manager'))
        || (title.includes('governance') && haystack.includes('governed_api'))
        || (title.includes('contract') && haystack.includes('contracts'));
    }).length;
  }, [descriptors, selectedSection]);

  const handleExport = async () => {
    if (!selectedSection) return;
    setIsExporting(true);
    try {
      const csv = buildCsv(selectedSection, filteredDetailRows as Array<Record<string, unknown>>);
      const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}muleops-${selectedSection.category.id}-${range}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `${selectedSection.category.title} CSV`,
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSummary = async () => {
    if (visibleSections.length === 0) return;
    setIsExporting(true);
    try {
      const csv = buildSummaryCsv(visibleSections);
      const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}muleops-usage-summary-${range}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Usage summary CSV',
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Usage Reports" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="refresh" onPress={() => void refetch()} disabled={isRefetching} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.heroTitle}>
              Metering and exports
            </Text>
            <Text variant="bodyMedium" style={styles.heroCopy}>
              This screen is driven by the same metering endpoints captured in your HAR: `meters:describe` plus `meters:search`, with CSV export for the visible detail rows.
            </Text>
            <View style={styles.rangeRow}>
              {(['30d', '90d', '365d'] as RangeOption[]).map((option) => {
                const selected = option === range;
                return (
                  <Button
                    key={option}
                    compact
                    mode={selected ? 'contained-tonal' : 'outlined'}
                    onPress={() => setRange(option)}
                  >
                    {getRangeLabel(option)}
                  </Button>
                );
              })}
            </View>
            <View style={styles.toggleRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                Show only categories with data
              </Text>
              <Switch value={showOnlyWithData} onValueChange={setShowOnlyWithData} />
            </View>
          </Card.Content>
        </Card>

        <View style={styles.categoryGrid}>
          {visibleSections.map((section, index) => {
            const value = findPrimaryMetric(section.aggregate.data[0] ?? {}, section.category.summaryMetric);
            const selected = section.category.id === selectedCategoryId;
            const accent = [
              theme.colors.primary,
              anypointColors.success,
              anypointColors.accent,
              anypointColors.warning,
              anypointColors.secondary,
            ][index % 5];
            return (
              <Button
                key={section.category.id}
                mode={selected ? 'contained-tonal' : 'outlined'}
                onPress={() => setSelectedCategoryId(section.category.id)}
                style={[
                  styles.categoryButton,
                  selected ? { borderColor: accent } : undefined,
                ]}
              >
                {`${section.category.title}: ${formatMetricValue(value, section.category.summaryUnit)}`}
              </Button>
            );
          })}
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  {selectedSection?.category.title ?? 'Usage category'}
                </Text>
                <Text variant="bodySmall" style={styles.sectionSubtitle}>
                  {descriptorCount > 0 ? `${descriptorCount} matching meter descriptors found.` : 'Using the HAR-selected meter queries for this category.'}
                </Text>
              </View>
              <Button mode="contained" onPress={() => void handleExport()} loading={isExporting}>
                Export CSV
              </Button>
            </View>
            <View style={styles.sectionHeaderActions}>
              <Button mode="outlined" onPress={() => void handleExportSummary()} loading={isExporting}>
                Export summary
              </Button>
              <TextInput
                mode="outlined"
                dense
                placeholder="Filter rows"
                value={detailFilter}
                onChangeText={setDetailFilter}
                style={styles.filterInput}
              />
            </View>

            {isLoading || !selectedSection ? (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                Loading usage data...
              </Text>
            ) : (
              <>
                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
                    <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                      {formatMetricValue(
                        findPrimaryMetric(
                          selectedSection.aggregate.data[0] ?? {},
                          selectedSection.category.summaryMetric,
                        ),
                        selectedSection.category.summaryUnit,
                      )}
                    </Text>
                    <Text style={styles.statLabel}>Aggregate</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: anypointColors.accent + '12' }]}>
                    <Text style={[styles.statValue, { color: anypointColors.accent }]}>
                      {filteredDetailRows.length}
                    </Text>
                    <Text style={styles.statLabel}>Detail rows</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
                    <Text style={[styles.statValue, { color: anypointColors.success }]}>
                      {selectedSection.aggregate.metadata.lastUpdatedAt
                        ? new Date(selectedSection.aggregate.metadata.lastUpdatedAt).toLocaleDateString()
                        : '--'}
                    </Text>
                    <Text style={styles.statLabel}>Last updated</Text>
                  </View>
                </View>

                {filteredDetailRows.length === 0 ? (
                  <Text variant="bodySmall" style={styles.emptyCopy}>
                    No rows match the current filter. Try clearing the filter or a broader time range.
                  </Text>
                ) : (
                  filteredDetailRows.slice(0, 20).map((row, index) => (
                    <View
                      key={`${selectedSection.category.id}-${index}`}
                      style={[styles.rowCard, { borderColor: theme.colors.outlineVariant }]}
                    >
                      {selectedSection.category.detailColumns.map((column) => {
                        const raw = (row as Record<string, unknown>)[column];
                        if (raw == null || raw === '') return null;
                        return (
                          <View key={column} style={styles.rowItem}>
                            <Text style={styles.rowLabel}>{column.replaceAll('_', ' ')}</Text>
                            <Text style={styles.rowValue}>{String(raw)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))
                )}
              </>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  heroTitle: {
    fontWeight: '800',
    marginBottom: 6,
  },
  heroCopy: {
    color: theme.colors.onSurfaceVariant,
    lineHeight: 20,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  toggleRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryGrid: {
    gap: 10,
  },
  categoryButton: {
    justifyContent: 'flex-start',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: theme.colors.onSurfaceVariant,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  rowCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  filterInput: {
    flex: 1,
  },
  rowItem: {
    gap: 2,
  },
  rowLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  rowValue: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
  },
});

export default UsageReportsScreen;
