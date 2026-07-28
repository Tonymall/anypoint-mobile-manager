// ============================================================
// API Detail - shared styles
// ============================================================

import { StyleSheet } from 'react-native';
import { type MD3Theme } from 'react-native-paper';

export const createStyles = (theme: MD3Theme) => StyleSheet.create({
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
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 10,
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoList: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
  },
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
  },
  policyCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
  },
  policyDescription: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  metaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '600',
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  templateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tierLimit: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 6,
  },
  contractCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  contractActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  dialogInput: {
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    marginBottom: 4,
  },
  dialogHelp: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 18,
  },
  autoApproveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tierActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});

export type APIDetailStyles = ReturnType<typeof createStyles>;
