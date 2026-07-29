// ============================================================
// Exchange — Asset Search & Browse Screen
// ============================================================
// Built on the design token layer: asset types resolve to semantic
// accent roles rather than named brand colours, so both schemes are
// defined in one place.
//
// The empty state distinguishes "Exchange has nothing published" from
// "your search or type filter excluded everything".
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Button, Searchbar, Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { AssetType, ExchangeAsset } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { useExchangeSearch } from '../../hooks/queries/useExchangeQueries';
import { useDebounce } from '../../hooks/useDebounce';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';

// -- Filter chip definitions ------------------------------------------------

type TypeFilter = 'all' | AssetType;

const TYPE_FILTERS: { label: string; value: TypeFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'REST API', value: 'rest-api' },
  { label: 'SOAP API', value: 'soap-api' },
  { label: 'Connector', value: 'connector' },
  { label: 'Template', value: 'template' },
  { label: 'Policy', value: 'policy' },
];

// -- Helpers ----------------------------------------------------------------

/**
 * Asset type → semantic accent role. Types are categorical, not
 * statuses, so they map onto the accent roles plus the two status roles
 * whose hues the catalogue already used.
 */
const assetTypeRole = (t: Tokens, type: AssetType): StatusRole => {
  const map: Partial<Record<string, StatusRole>> = {
    'rest-api': t.color.accent.brand,
    'soap-api': t.color.accent.tertiary,
    'http-api': t.color.status.info,
    'raml-fragment': t.color.accent.secondary,
    connector: t.color.status.success,
    template: t.color.status.warning,
    example: t.color.status.success,
    policy: t.color.status.info,
    custom: t.color.accent.brand,
  };
  return map[type] ?? t.color.accent.brand;
};

const assetTypeLabel = (type: AssetType): string => {
  const map: Record<string, string> = {
    'rest-api': 'REST API',
    'soap-api': 'SOAP API',
    'http-api': 'HTTP API',
    'raml-fragment': 'RAML Fragment',
    connector: 'Connector',
    template: 'Template',
    example: 'Example',
    policy: 'Policy',
    custom: 'Custom',
  };
  return map[type] ?? type;
};

// -- Rating Stars -----------------------------------------------------------

const RatingStars: React.FC<{ rating: number; count: number; t: Tokens }> = ({
  rating,
  count,
  t,
}) => {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const starColor = t.color.status.warning.base;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<Icon key={i} name="star" size={13} color={starColor} />);
    } else if (i === fullStars && hasHalf) {
      stars.push(<Icon key={i} name="star-half-full" size={13} color={starColor} />);
    } else {
      stars.push(<Icon key={i} name="star-outline" size={13} color={t.color.text.tertiary} />);
    }
  }

  return (
    <View
      style={ratingStyles.container}
      accessibilityLabel={`Rating: ${rating.toFixed(1)} out of 5, ${count} ratings`}
    >
      {stars}
      <Text style={[ratingStyles.count, { color: t.color.text.tertiary }]}>({count})</Text>
    </View>
  );
};

const ratingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  count: { ...typeScale.caption, fontWeight: '500', marginLeft: spacing.xs },
});

// -- Asset Card Component ---------------------------------------------------

const AssetCard: React.FC<{
  item: ExchangeAsset;
  t: Tokens;
  onPress: (item: ExchangeAsset) => void;
}> = ({ item, t, onPress }) => {
  const role = assetTypeRole(t, item.type);
  const isDeprecated = item.status === 'deprecated';

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityLabel={`Exchange asset: ${item.name}, type ${assetTypeLabel(item.type)}, version ${item.version}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyles.card,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
          borderLeftColor: role.base,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={cardStyles.titleWrap}>
          <Text numberOfLines={1} style={[typeScale.subheading, { color: t.color.text.primary }]}>
            {item.name}
          </Text>
          <Text style={[typeScale.caption, cardStyles.version, { color: t.color.text.tertiary }]}>
            v{item.version}
          </Text>
        </View>

        {/* Type badge */}
        <View style={[cardStyles.typeBadge, { backgroundColor: role.surface }]}>
          <Text style={[cardStyles.typeText, { color: role.base }]}>
            {assetTypeLabel(item.type)}
          </Text>
        </View>
      </View>

      {/* Deprecated banner */}
      {isDeprecated && (
        <View
          style={[cardStyles.deprecatedBanner, { backgroundColor: t.color.status.warning.surface }]}
        >
          <Icon name="alert-outline" size={12} color={t.color.status.warning.base} />
          <Text style={[cardStyles.deprecatedText, { color: t.color.status.warning.base }]}>
            DEPRECATED
          </Text>
        </View>
      )}

      {/* Description */}
      {item.description ? (
        <Text
          numberOfLines={2}
          style={[typeScale.bodySmall, cardStyles.description, { color: t.color.text.secondary }]}
        >
          {item.description}
        </Text>
      ) : null}

      {/* Footer: rating + date */}
      <View style={[cardStyles.footer, { borderTopColor: t.color.border.subtle }]}>
        <RatingStars rating={item.rating} count={item.numberOfRatings} t={t} />
        <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
          {formatRelativeTime(item.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  version: {
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  typeText: { ...typeScale.micro, fontWeight: '700', letterSpacing: 0.6 },
  deprecatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  deprecatedText: { ...typeScale.micro, fontWeight: '700', letterSpacing: 0.6 },
  description: {
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
});

// -- Loading placeholder ----------------------------------------------------

const AssetListSkeleton: React.FC = () => {
  const t = useTokens();
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading Exchange assets">
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonCard,
            { backgroundColor: t.color.surface.raised, borderColor: t.color.border.subtle },
          ]}
        >
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonHeaderText}>
              <Skeleton width="55%" height={16} />
              <Skeleton width="20%" height={11} />
            </View>
            <Skeleton width={70} height={22} radius={radii.sm} />
          </View>
          <Skeleton width="100%" height={12} />
          <Skeleton width="70%" height={12} />
        </View>
      ))}
    </View>
  );
};

// -- Main Component ---------------------------------------------------------

const ExchangeSearchScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: assetsResponse,
    isLoading,
    error,
    refetch,
  } = useExchangeSearch({ search: debouncedSearch || undefined, types: typeFilter !== 'all' ? [typeFilter] : undefined });

  const pullRefresh = usePullRefresh(refetch);

  const assets = useMemo(() => assetsResponse?.data ?? [], [assetsResponse]);

  const handleAssetPress = useCallback(
    (asset: ExchangeAsset) => {
      hapticLight();
      router.push({
        pathname: '/(main)/apis/asset-detail' as any,
        params: { groupId: asset.groupId, assetId: asset.assetId, version: asset.version },
      });
    },
    [router],
  );

  // Is the list empty because nothing is published, or because we
  // excluded everything?
  const isNarrowed = searchQuery.trim() !== '' || typeFilter !== 'all';
  const activeTypeLabel = typeFilter === 'all' ? '' : assetTypeLabel(typeFilter);

  const clearFilters = useCallback(() => {
    hapticLight();
    setSearchQuery('');
    setTypeFilter('all');
  }, []);

  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typeScale.title, { color: t.color.text.primary }]}>Exchange</Text>
        {isLoading ? (
          <Skeleton width={90} height={12} style={styles.headerCountSkeleton} />
        ) : (
          <Text style={[typeScale.caption, styles.headerCount, { color: t.color.text.tertiary }]}>
            {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
          </Text>
        )}
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Search Exchange assets..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={[
          styles.searchbar,
          { backgroundColor: t.color.surface.sunken, borderColor: t.color.border.subtle },
        ]}
        inputStyle={styles.searchInput}
        elevation={0}
        accessibilityLabel="Search Exchange assets"
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {TYPE_FILTERS.map((f) => {
          const isSelected = typeFilter === f.value;
          const role = f.value === 'all' ? t.color.accent.brand : assetTypeRole(t, f.value);
          return (
            <Pressable
              key={f.value}
              onPress={() => { hapticLight(); setTypeFilter(f.value); }}
              accessibilityLabel={`Filter: ${f.label}${isSelected ? ', selected' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? role.surface : t.color.surface.raised,
                  borderColor: isSelected ? role.border : t.color.border.subtle,
                },
              ]}
            >
              {isSelected && f.value !== 'all' && (
                <View style={[styles.chipDot, { backgroundColor: role.base }]} />
              )}
              <Text
                style={[
                  typeScale.label,
                  {
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? role.base : t.color.text.secondary,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Asset list */}
      <FlatList
        data={isLoading ? [] : assets}
        keyExtractor={(item) => `${item.groupId}:${item.assetId}:${item.version}`}
        renderItem={({ item }) => <AssetCard item={item} t={t} onPress={handleAssetPress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[t.color.brand.base]}
            tintColor={t.color.brand.base}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <AssetListSkeleton />
          ) : isNarrowed ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
                <Icon name="filter-remove-outline" size={32} color={t.color.text.tertiary} />
              </View>
              <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
                No assets match your filters
              </Text>
              <Text style={[typeScale.bodySmall, styles.emptyBody, { color: t.color.text.secondary }]}>
                {searchQuery.trim() !== '' && typeFilter !== 'all'
                  ? `Nothing in Exchange matches “${searchQuery.trim()}” of type ${activeTypeLabel}.`
                  : searchQuery.trim() !== ''
                    ? `Nothing in Exchange matches “${searchQuery.trim()}”.`
                    : `No ${activeTypeLabel} assets are published to this Exchange.`}
              </Text>
              <Button mode="contained-tonal" onPress={clearFilters} style={styles.emptyAction}>
                Clear filters
              </Button>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
                <Icon name="package-variant" size={32} color={t.color.text.tertiary} />
              </View>
              <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
                Nothing published to Exchange
              </Text>
              <Text style={[typeScale.bodySmall, styles.emptyBody, { color: t.color.text.secondary }]}>
                Exchange is your organization&rsquo;s catalog of reusable assets — APIs,
                connectors, templates, examples and policies. Assets published from Design
                Center, Studio or the platform appear here.
              </Text>
              <View
                style={[
                  styles.emptyHint,
                  {
                    backgroundColor: t.color.brand.surface,
                    borderColor: withAlpha(t.color.brand.base, 'border'),
                  },
                ]}
              >
                <Icon name="information-outline" size={14} color={t.color.text.accent} />
                <Text style={[typeScale.caption, styles.emptyHintText, { color: t.color.text.secondary }]}>
                  Results are scoped to your organization. If you expected assets here, check
                  the organization selected in Settings.
                </Text>
              </View>
            </View>
          )
        }
      />
    </View>
  );
};

// -- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  headerCount: {
    marginTop: 2,
  },
  headerCountSkeleton: {
    marginTop: 4,
  },
  searchbar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 44,
  },
  searchInput: {
    ...typeScale.body,
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: spacing.lg,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  emptyHintText: {
    flex: 1,
    fontWeight: '500',
  },
  skeletonList: {
    gap: spacing.md,
  },
  skeletonCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: 6,
  },
});

export default ExchangeSearchScreen;
