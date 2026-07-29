// ═══════════════════════════════════════════════════════════════════
// Logs — filter sheet
// ═══════════════════════════════════════════════════════════════════
// Progressive disclosure for the controls that used to occupy four
// stacked rows above the first log line: level, time range and the feed
// switches (live polling, auto-scroll). Nothing was removed — it all
// lives one tap away instead of permanently eating half the viewport.
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import FilterChip from './FilterChip';
import {
  DATE_RANGES,
  DEFAULT_LEVEL,
  DEFAULT_RANGE_INDEX,
  LOG_LEVELS,
  levelRole,
  type LogLevel,
} from './filters';

export interface LogFilterSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Level filtering only applies to the app-log feed. */
  showLevels: boolean;
  level: LogLevel;
  onLevelChange: (level: LogLevel) => void;
  /** Entry count per level, for the chip badges. */
  levelCounts: Record<string, number>;
  totalCount: number;
  rangeIndex: number;
  onRangeChange: (index: number) => void;
  /** Feed switches are app-log only; hidden on the audit tab. */
  showFeedControls: boolean;
  liveMode: boolean;
  onLiveModeChange: (value: boolean) => void;
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  onReset: () => void;
  canReset: boolean;
}

function LogFilterSheet({
  visible,
  onDismiss,
  showLevels,
  level,
  onLevelChange,
  levelCounts,
  totalCount,
  rangeIndex,
  onRangeChange,
  showFeedControls,
  liveMode,
  onLiveModeChange,
  autoScroll,
  onAutoScrollChange,
  onReset,
  canReset,
}: LogFilterSheetProps) {
  const t = useTokens();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdropWrap}>
        <Pressable
          style={[
            styles.backdrop,
            { backgroundColor: withAlpha(t.color.shadow, 0.45) },
          ]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
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
          <View
            style={[styles.header, { borderBottomColor: t.color.border.subtle }]}
          >
            <Text style={[typeScale.heading, { color: t.color.text.primary }]}>
              Filters
            </Text>
            <View style={styles.headerActions}>
              {canReset ? (
                <Pressable
                  onPress={() => {
                    hapticSelection();
                    onReset();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Reset all filters"
                >
                  <Text style={[typeScale.caption, { color: t.color.text.accent }]}>
                    Reset
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onDismiss}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <Icon name="close" size={20} color={t.color.text.tertiary} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {showLevels ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
                  LEVEL
                </Text>
                <View style={styles.chipWrap}>
                  {LOG_LEVELS.map((option) => (
                    <FilterChip
                      key={option}
                      label={option}
                      count={option === DEFAULT_LEVEL ? totalCount : levelCounts[option]}
                      selected={level === option}
                      role={levelRole(t, option)}
                      onPress={() => onLevelChange(option)}
                      accessibilityLabel={`${option} level filter`}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
                TIME RANGE
              </Text>
              <View style={styles.chipWrap}>
                {DATE_RANGES.map((range, index) => (
                  <FilterChip
                    key={range.label}
                    label={range.label}
                    selected={rangeIndex === index}
                    onPress={() => onRangeChange(index)}
                    accessibilityLabel={`Last ${range.label}`}
                  />
                ))}
              </View>
            </View>

            {showFeedControls ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
                  FEED
                </Text>
                <View
                  style={[
                    styles.switchRow,
                    { borderBottomColor: t.color.border.subtle },
                  ]}
                >
                  <View style={styles.switchText}>
                    <Text style={[typeScale.bodySmall, { color: t.color.text.primary }]}>
                      Live updates
                    </Text>
                    <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>
                      Poll for new entries every few seconds
                    </Text>
                  </View>
                  <Switch value={liveMode} onValueChange={onLiveModeChange} />
                </View>
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={[typeScale.bodySmall, { color: t.color.text.primary }]}>
                      Auto-scroll
                    </Text>
                    <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>
                      Jump to the newest entry when the feed refreshes
                    </Text>
                  </View>
                  <Switch value={autoScroll} onValueChange={onAutoScrollChange} />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** True when anything differs from the screen's defaults. */
export function activeFilterCount(level: LogLevel, rangeIndex: number): number {
  let count = 0;
  if (level !== DEFAULT_LEVEL) count++;
  if (rangeIndex !== DEFAULT_RANGE_INDEX) count++;
  return count;
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typeScale.micro,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
  },
});

export default memo(LogFilterSheet);
