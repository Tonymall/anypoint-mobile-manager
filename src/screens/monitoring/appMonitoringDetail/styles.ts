// ============================================================
// App Monitoring Detail - shared styles
// ============================================================

import { StyleSheet } from 'react-native';
import { type MD3Theme } from 'react-native-paper';

export const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    statusCard: {
      marginHorizontal: 16,
      marginTop: 8,
      borderLeftWidth: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      elevation: 0,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    dateRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexWrap: 'wrap',
      gap: 6,
    },
    dateChip: {
      borderColor: theme.colors.outline,
    },
    dateChipText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    tabBarScroll: {
      maxHeight: 48,
      marginBottom: 8,
    },
    tabBarContent: {
      paddingHorizontal: 16,
      gap: 8,
      alignItems: 'center',
    },
    tabChip: {
      borderColor: theme.colors.outline,
    },
    tabChipText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    metricsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 12,
    },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      elevation: 0,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    sectionLabel: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    healthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    healthLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    healthDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    healthBar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.surfaceVariant,
    },
  });

export type AppMonitoringDetailStyles = ReturnType<typeof createStyles>;
