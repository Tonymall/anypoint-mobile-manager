// ============================================================
// Exchange - Asset Detail Screen
// 2026 Modern Dark-First Design with glassmorphic cards,
// collapsible sections, and accent borders.
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { AssetType, ExchangeAsset, AssetFile, AssetCategory } from '../../types';
import { anypointColors } from '../../theme';
import { useExchangeSearch } from '../../hooks/queries/useExchangeQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

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

// -- InfoItem ---------------------------------------------------------------

const InfoItem: React.FC<{
  label: string;
  value: string;
  icon?: string;
  iconColor?: string;
}> = ({ label, value, icon, iconColor }) => {
  const theme = useTheme();
  return (
    <View style={infoStyles.row}>
      {icon && (
        <View style={[infoStyles.iconBox, { backgroundColor: (iconColor ?? theme.colors.onSurfaceVariant) + '14' }]}>
          <Icon name={icon} size={14} color={iconColor ?? theme.colors.onSurfaceVariant} />
        </View>
      )}
      <Text
        variant="labelMedium"
        style={{ color: theme.colors.onSurfaceVariant, width: icon ? 100 : 110, flexShrink: 0 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurface, flex: 1 }}
        selectable
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
};

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 8,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

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
      stars.push(<Icon key={i} name="star" size={16} color={anypointColors.warning} />);
    } else if (i === fullStars && hasHalf) {
      stars.push(<Icon key={i} name="star-half-full" size={16} color={anypointColors.warning} />);
    } else {
      stars.push(<Icon key={i} name="star-outline" size={16} color={theme.colors.onSurfaceVariant} />);
    }
  }

  return (
    <View style={ratingStyles.container} accessibilityLabel={`Rating: ${rating.toFixed(1)} out of 5, ${count} ratings`}>
      {stars}
      <Text style={[ratingStyles.value, { color: theme.colors.onSurface }]}>
        {rating.toFixed(1)}
      </Text>
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
    gap: 3,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  count: {
    fontSize: 12,
    fontWeight: '500',
  },
});

// -- Collapsible Section ----------------------------------------------------

const CollapsibleSection: React.FC<{
  title: string;
  accentColor: string;
  count?: number;
  children: React.ReactNode;
}> = ({ title, accentColor, count, children }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => { hapticLight(); setExpanded((e) => !e); }}
        accessibilityLabel={`${title} section, ${expanded ? 'expanded' : 'collapsed'}${count != null ? `, ${count} items` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={sectionStyles.header}
      >
        <View style={[sectionStyles.accent, { backgroundColor: accentColor }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8, flex: 1 }}>
          {title.toUpperCase()} {count != null ? `(${count})` : ''}
        </Text>
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      </Pressable>
      {expanded && children}
    </View>
  );
};

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  accent: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
});

// -- File Row ---------------------------------------------------------------

const FileRow: React.FC<{ file: AssetFile; theme: MD3Theme }> = ({ file, theme }) => (
  <View
    style={[fileStyles.row, { borderBottomColor: theme.colors.outlineVariant }]}
    accessibilityLabel={`File: ${file.classifier}, packaging ${file.packaging}`}
  >
    <View style={[fileStyles.iconBox, { backgroundColor: anypointColors.primary + '14' }]}>
      <Icon name="file-outline" size={14} color={anypointColors.primary} />
    </View>
    <View style={fileStyles.info}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }} numberOfLines={1}>
        {file.classifier}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {file.packaging}
      </Text>
    </View>
    <Icon name="download-outline" size={18} color={theme.colors.onSurfaceVariant} />
  </View>
);

const fileStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
});

// -- Main Screen ------------------------------------------------------------

const ExchangeAssetDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { groupId, assetId, version } = useLocalSearchParams<{
    groupId: string;
    assetId: string;
    version: string;
  }>();

  // Fetch asset detail by searching for the specific asset
  const {
    data: searchResult,
    isLoading,
    isError,
    error,
    refetch,
  } = useExchangeSearch({
    search: assetId as string,
  });

  // Find the exact asset from search results
  const asset: ExchangeAsset | undefined = useMemo(() => {
    const items = searchResult?.data ?? [];
    return items.find(
      (a) => a.groupId === groupId && a.assetId === assetId && a.version === version,
    ) ?? items[0];
  }, [searchResult, groupId, assetId, version]);

  const handleBack = useCallback(() => router.back(), [router]);

  // -- Loading / Error states --
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
          <Appbar.Content title="Asset" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <LoadingState message="Loading asset details..." />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
          <Appbar.Content title="Asset" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load asset details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const typeColor = assetTypeBadgeColor(asset.type);
  const isDeprecated = asset.status === 'deprecated';

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
        <Appbar.Content
          title={asset.name}
          titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }}
        />
        <Appbar.Action icon="refresh" onPress={() => refetch()} accessibilityLabel="Refresh" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Asset Header Card */}
        <View style={[styles.headerCard, { borderLeftColor: typeColor, borderColor: theme.colors.outlineVariant }]}>
          <View style={[styles.headerGlow, { backgroundColor: typeColor }]} />
          <View style={styles.headerContent}>
            {/* Name + Type badge */}
            <View style={styles.headerRow}>
              <Text
                variant="titleLarge"
                style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.3, flex: 1 }}
                numberOfLines={2}
              >
                {asset.name}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
                <Text style={[styles.typeText, { color: typeColor }]}>
                  {assetTypeLabel(asset.type)}
                </Text>
              </View>
            </View>

            {/* Version + Status */}
            <View style={styles.metaRow}>
              <View style={[styles.versionBadge, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Icon name="tag-outline" size={12} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.versionText, { color: theme.colors.onSurface }]}>
                  v{asset.version}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isDeprecated
                      ? anypointColors.warning + '18'
                      : anypointColors.success + '18',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isDeprecated
                        ? anypointColors.warning
                        : anypointColors.success,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: isDeprecated
                        ? anypointColors.warning
                        : anypointColors.success,
                    },
                  ]}
                >
                  {asset.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Rating */}
            <View style={{ marginTop: 12 }}>
              <RatingStars rating={asset.rating} count={asset.numberOfRatings} theme={theme} />
            </View>
          </View>
        </View>

        {/* Description Section */}
        {asset.description ? (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: theme.colors.secondary }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                DESCRIPTION
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurface, lineHeight: 22 }}
                selectable
              >
                {asset.description}
              </Text>
            </View>
          </>
        ) : null}

        {/* Details */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: anypointColors.primary }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            DETAILS
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <InfoItem label="Group ID" value={asset.groupId} icon="folder-outline" iconColor={theme.colors.primary} />
          <InfoItem label="Asset ID" value={asset.assetId} icon="identifier" iconColor={theme.colors.secondary} />
          <InfoItem label="Version" value={asset.version} icon="tag-outline" iconColor={anypointColors.accent} />
          <InfoItem label="Created" value={formatRelativeTime(asset.createdAt)} icon="clock-outline" iconColor={anypointColors.info} />
        </View>

        {/* Files Section (Collapsible) */}
        {asset.files && asset.files.length > 0 && (
          <CollapsibleSection
            title="Files"
            accentColor={anypointColors.primary}
            count={asset.files.length}
          >
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {asset.files.map((file, index) => (
                <FileRow key={`${file.classifier}-${index}`} file={file} theme={theme} />
              ))}
            </View>
          </CollapsibleSection>
        )}

        {/* Tags Section */}
        {asset.tags && asset.tags.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.accent }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                TAGS ({asset.tags.length})
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.tagsWrap}>
                {asset.tags.map((tag) => (
                  <View
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: anypointColors.accent + '14' }]}
                    accessibilityLabel={`Tag: ${tag}`}
                  >
                    <Icon name="pound" size={11} color={anypointColors.accent} />
                    <Text style={[styles.tagChipText, { color: anypointColors.accent }]}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Categories Section */}
        {asset.categories && asset.categories.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.mulePurple }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                CATEGORIES ({asset.categories.length})
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {asset.categories.map((cat: AssetCategory) => (
                <InfoItem
                  key={cat.key}
                  label={cat.displayName || cat.key}
                  value={cat.value}
                  icon="shape-outline"
                  iconColor={anypointColors.mulePurple}
                />
              ))}
            </View>
          </>
        )}

        {/* Documentation Section (Collapsible) */}
        {asset.documentation && asset.documentation.length > 0 && (
          <CollapsibleSection
            title="Documentation"
            accentColor={anypointColors.info}
            count={asset.documentation.length}
          >
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {asset.documentation.map((doc, index) => (
                <View
                  key={`${doc.title}-${index}`}
                  style={[styles.docRow, { borderBottomColor: theme.colors.outlineVariant }]}
                  accessibilityLabel={`Documentation page: ${doc.title}`}
                >
                  <View style={[styles.docIconBox, { backgroundColor: anypointColors.info + '14' }]}>
                    <Icon name="file-document-outline" size={14} color={anypointColors.info} />
                  </View>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, flex: 1, fontWeight: '500' }}
                    numberOfLines={1}
                  >
                    {doc.title}
                  </Text>
                </View>
              ))}
            </View>
          </CollapsibleSection>
        )}
      </ScrollView>
    </View>
  );
};

// -- Styles -----------------------------------------------------------------

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    // -- Header Card --
    headerCard: {
      marginHorizontal: 16,
      marginTop: 12,
      borderLeftWidth: 3,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      overflow: 'hidden',
    },
    headerGlow: {
      height: 2,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    headerContent: {
      padding: 16,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
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
    versionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    versionText: {
      fontSize: 12,
      fontWeight: '600',
      fontFamily: 'monospace',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      gap: 6,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    // -- Section --
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 10,
    },
    sectionAccent: {
      width: 3,
      height: 14,
      borderRadius: 2,
    },
    // -- Card --
    card: {
      marginHorizontal: 16,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      padding: 16,
    },
    // -- Tags --
    tagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      gap: 4,
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    // -- Documentation --
    docRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 10,
    },
    docIconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

export default ExchangeAssetDetailScreen;
