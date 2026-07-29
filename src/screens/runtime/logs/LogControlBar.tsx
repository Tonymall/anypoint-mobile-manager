// ═══════════════════════════════════════════════════════════════════
// Logs — the control bar
// ═══════════════════════════════════════════════════════════════════
// One compact row replacing the stack of six that used to sit between
// the title and the first log line:
//
//   [ App | Audit ]  [ search…………… ]  [ ⚙ 1h ② ]
//
// plus a chip row that only appears once something is actually
// filtered. The feed switch (App/Audit) is a quiet segmented control
// rather than two filled chips; level, time range and the live/
// auto-scroll switches live behind the filter button.
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type Tokens,
} from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import FilterChip from './FilterChip';
import {
  DATE_RANGES,
  DEFAULT_LEVEL,
  DEFAULT_RANGE_INDEX,
  levelRole,
  type LogLevel,
} from './filters';

export type LogTab = 'app' | 'audit';

function SegmentButton({
  t,
  label,
  count,
  selected,
  onPress,
}: {
  t: Tokens;
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} logs${selected ? ', selected' : ''}${count > 0 ? `, ${count} entries` : ''}`}
      style={[
        styles.segment,
        selected && {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.default,
        },
      ]}
    >
      <Text
        style={[
          styles.segmentLabel,
          { color: selected ? t.color.text.primary : t.color.text.tertiary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface LogControlBarProps {
  tab: LogTab;
  onTabChange: (tab: LogTab) => void;
  appCount: number;
  auditCount: number;

  search: string;
  onSearchChange: (value: string) => void;

  level: LogLevel;
  onClearLevel: () => void;
  rangeIndex: number;
  onClearRange: () => void;

  activeCount: number;
  onOpenFilters: () => void;
}

function LogControlBar({
  tab,
  onTabChange,
  appCount,
  auditCount,
  search,
  onSearchChange,
  level,
  onClearLevel,
  rangeIndex,
  onClearRange,
  activeCount,
  onOpenFilters,
}: LogControlBarProps) {
  const t = useTokens();
  const rangeLabel = DATE_RANGES[rangeIndex]?.label ?? DATE_RANGES[0].label;
  const showLevelChip = tab === 'app' && level !== DEFAULT_LEVEL;
  const showRangeChip = rangeIndex !== DEFAULT_RANGE_INDEX;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View
          style={[
            styles.segmented,
            {
              backgroundColor: t.color.surface.sunken,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <SegmentButton
            t={t}
            label="App"
            count={appCount}
            selected={tab === 'app'}
            onPress={() => onTabChange('app')}
          />
          <SegmentButton
            t={t}
            label="Audit"
            count={auditCount}
            selected={tab === 'audit'}
            onPress={() => onTabChange('audit')}
          />
        </View>

        <View
          style={[
            styles.search,
            {
              backgroundColor: t.color.surface.sunken,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <Icon name="magnify" size={16} color={t.color.text.tertiary} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search"
            placeholderTextColor={t.color.text.tertiary}
            style={[styles.searchInput, { color: t.color.text.primary }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search logs"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => onSearchChange('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close-circle" size={14} color={t.color.text.tertiary} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={() => {
            hapticSelection();
            onOpenFilters();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Filters. Time range last ${rangeLabel}${activeCount > 0 ? `, ${activeCount} active` : ''}`}
          accessibilityHint="Double tap to choose level, time range and feed options"
          style={({ pressed }) => [
            styles.filterButton,
            {
              borderColor:
                activeCount > 0 ? t.color.accent.brand.border : t.color.border.subtle,
              backgroundColor:
                activeCount > 0
                  ? t.color.accent.brand.surface
                  : pressed
                    ? withAlpha(t.color.text.primary, 'faint')
                    : t.color.surface.sunken,
            },
          ]}
        >
          <Icon
            name="tune-variant"
            size={15}
            color={activeCount > 0 ? t.color.accent.brand.base : t.color.text.secondary}
          />
          <Text
            style={[
              styles.filterLabel,
              {
                color:
                  activeCount > 0 ? t.color.accent.brand.base : t.color.text.secondary,
              },
            ]}
          >
            {rangeLabel}
          </Text>
        </Pressable>
      </View>

      {showLevelChip || showRangeChip ? (
        <View style={styles.activeRow}>
          {showLevelChip ? (
            <FilterChip
              label={level}
              selected
              removable
              role={levelRole(t, level)}
              onPress={onClearLevel}
              accessibilityLabel={`Level filter ${level}, active`}
            />
          ) : null}
          {showRangeChip ? (
            <FilterChip
              label={`Last ${rangeLabel}`}
              selected
              removable
              onPress={onClearRange}
              accessibilityLabel={`Time range last ${rangeLabel}, active`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentLabel: typeScale.caption,
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    height: 36,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    ...typeScale.bodySmall,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    height: 36,
  },
  filterLabel: typeScale.caption,
  activeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

export default memo(LogControlBar);
