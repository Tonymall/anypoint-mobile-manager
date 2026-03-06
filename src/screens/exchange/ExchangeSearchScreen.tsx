// ============================================================
// Exchange - Asset Search & Browse Screen
// 2026 Modern Dark-First Design with glassmorphic cards,
// accent borders, filter chips, and rating stars.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import {
  Searchbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import type { AssetType, ExchangeAsset } from '../../types';
import { anypointColors } from '../../theme';
import { useExchangeSearch } from '../../hooks/queries/useExchangeQueries';
import { useDebounce } from '../../hooks/useDebounce';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// -- Filter chip definitions ------------------------------------------------

type TypeFilter = 'all' | AssetType;

const TYPE_FILTERS: { label: string; value: TypeFilter; icon: string; color?: string }[] = [
  { label: 'All', value: 'all', icon: 'view-grid-outline' },
  { label: 'REST API', value: 'rest-api', icon: 'api', color: anypointColors.primary },
  { label: 'SOAP API', value: 'soap-api', icon: 'xml', color: anypointColors.mulePurple },
  { label: 'Connector', value: 'connector', icon: 'puzzle-outline', color: anypointColors.accent },
  { label: 'Template', value: 'template', icon: 'file-document-outline', color: anypointColors.warning },
  { label: 'Policy', value: 'policy', icon: 'shield-lock-outline', color: anypointColors.info },
];

// -- Helpers ----------------------------------------------------------------

const assetTypeBadgeColor = (type: AssetType): string => {
  const map: Record<string, string> = {
    'rest-api': anypointColors.primary,
    'soap-api': anypointColors.mulePurple,
    'http-api': anypointColors.info,
    'raml-fragment': anypointColors.secondary,
    connector: anypointColors.accent,
    template: anypointColors.warning,
    example: anypointColors.muleGreen,
    policy: anypointColors.info,
    custom: anypointColors.primaryDark,
  };
  return map[type] ?? anypointColors.primaryDark;
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

const RatingStars: React.FC<{ rating: number; count: number; theme: MD3Theme }> = ({
  rating,
  count,
  theme,
}) => {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Icon key={i} name="star" size={13} color={anypointColors.warning} />,
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <Icon key={i} name="star-half-full" size={13} color={anypointColors.warning} />,
      );
    } else {
      stars.push(
        <Icon key={i} name="star-outline" size={13} color={theme.colors.onSurfaceVariant} />,
      );
    }
  }

  return (
    <View style={ratingStyles.container} accessibilityLabel={`Rating: ${rating.toFixed(1)} out of 5, ${count} ratings`}>
      {stars}
      <Text style={[ratingStyles.count, { color: theme.colors.onSurfaceVariant }]}>
        ({count})
      </Text>
    </View>
  );
};

const ratingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  count: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
});

// -- Asset Card Component ---------------------------------------------------

const AssetCard: React.FC<{
  item: ExchangeAsset;
  theme: MD3Theme;
  onPress: (item: ExchangeAsset) => void;
}> = ({ item, theme, onPress }) => {
  const typeColor = assetTypeBadgeColor(item.type);
  const isDeprecated = item.status === 'deprecated';

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityLabel={`Exchange asset: ${item.name}, type ${assetTypeLabel(item.type)}, version ${item.version}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          borderLeftColor: typeColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={cardStyles.titleWrap}>
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface, fontWeight: '600', letterSpacing: -0.2 }}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            v{item.version}
          </Text>
        </View>

        {/* Type badge */}
        <View style={[cardStyles.typeBadge, { backgroundColor: typeColor + '18' }]}>
          <Text style={[cardStyles.typeText, { color: typeColor }]}>
            {assetTypeLabel(item.type)}
          </Text>
        </View>
      </View>

      {/* Deprecated banner */}
      {isDeprecated && (
        <View style={[cardStyles.deprecatedBanner, { backgroundColor: anypointColors.warning + '14' }]}>
          <Icon name="alert-outline" size={12} color={anypointColors.warning} />
          <Text style={[cardStyles.deprecatedText, { color: anypointColors.warning }]}>
            DEPRECATED
          </Text>
        </View>
      )}

      {/* Description */}
      {item.description ? (
        <Text
          variant="bodySmall"
          numberOfLines={2}
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 10, lineHeight: 18 }}
        >
          {item.description}
        </Text>
      ) : null}

      {/* Footer: rating + date */}
      <View style={[cardStyles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
        <RatingStars rating={item.rating} count={item.numberOfRatings} theme={theme} />
        <Text style={[cardStyles.dateText, { color: theme.colors.onSurfaceVariant }]}>
          {formatRelativeTime(item.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    marginRight: 12,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  deprecatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  deprecatedText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

// -- Main Component ---------------------------------------------------------

const ExchangeSearchScreen: React.FC = () => {
  const theme = useTheme<MD3Theme>();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: assetsResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useExchangeSearch({ search: debouncedSearch || undefined, types: typeFilter !== 'all' ? [typeFilter] : undefined });

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

  if (isLoading) {
    return <LoadingState message="Loading Exchange assets..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Text
          variant="headlineSmall"
          style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.3 }}
        >
          Exchange
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </Text>
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Search Exchange assets..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={[styles.searchbar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
        inputStyle={{ fontSize: 14 }}
        elevation={0}
        accessibilityLabel="Search Exchange assets"
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {TYPE_FILTERS.map((f) => {
          const isSelected = typeFilter === f.value;
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
                  backgroundColor: isSelected
                    ? (f.color ?? theme.colors.primary) + '18'
                    : theme.colors.surface,
                  borderColor: isSelected
                    ? (f.color ?? theme.colors.primary) + '40'
                    : theme.colors.outlineVariant,
                },
              ]}
            >
              {isSelected && f.color && (
                <View style={[styles.chipDot, { backgroundColor: f.color }]} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected
                    ? (f.color ?? theme.colors.primary)
                    : theme.colors.onSurfaceVariant,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Asset list */}
      <FlatList
        data={assets}
        keyExtractor={(item) => `${item.groupId}:${item.assetId}:${item.version}`}
        renderItem={({ item }) => (
          <AssetCard item={item} theme={theme} onPress={handleAssetPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon name="package-variant" size={32} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              No assets match your search
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Try adjusting your filters or search query
            </Text>
          </View>
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
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ExchangeSearchScreen;
