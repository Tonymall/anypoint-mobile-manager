// ============================================================
// Design Center — Projects List Screen
// ============================================================
// Built on the design token layer: project classifiers resolve to
// semantic accent roles rather than named brand colours, so both
// schemes are defined in one place.
// ============================================================

import React, { useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { DesignCenterProject } from '../../types';
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
import { useProjects } from '../../hooks/queries/useDesignCenterQueries';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import type { IconName } from '../../types/icons';

// -- Helpers ----------------------------------------------------------------

/** Project classifier → semantic accent role (categorical, not status). */
const classifierRole = (t: Tokens, classifier?: string | null): StatusRole => {
  if (!classifier) return t.color.accent.brand;
  const map: Record<string, StatusRole> = {
    raml: t.color.accent.brand,
    oas: t.color.status.success,
    'raml-fragment': t.color.accent.secondary,
    mule: t.color.status.info,
    wsdl: t.color.accent.tertiary,
    graphql: t.color.status.warning,
  };
  return map[classifier.toLowerCase()] ?? t.color.accent.brand;
};

const classifierLabel = (classifier?: string | null): string => {
  if (!classifier) return 'Unknown';
  const map: Record<string, string> = {
    raml: 'RAML',
    oas: 'OAS',
    'raml-fragment': 'RAML Fragment',
    mule: 'Mule App',
    wsdl: 'WSDL',
    graphql: 'GraphQL',
  };
  return map[classifier.toLowerCase()] ?? classifier.toUpperCase();
};

const classifierIcon = (classifier?: string | null): IconName => {
  if (!classifier) return 'file-document-outline';
  const map: Record<string, IconName> = {
    raml: 'api',
    oas: 'api',
    'raml-fragment': 'puzzle-outline',
    mule: 'application-brackets-outline',
    wsdl: 'xml',
    graphql: 'graphql',
  };
  return map[classifier.toLowerCase()] ?? 'file-document-outline';
};

// -- Project Card -----------------------------------------------------------

const ProjectCard: React.FC<{
  item: DesignCenterProject;
  t: Tokens;
  onPress: (item: DesignCenterProject) => void;
}> = ({ item, t, onPress }) => {
  const role = classifierRole(t, item.classifier);

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityLabel={`Design Center project: ${item.name}, type ${classifierLabel(item.classifier)}, last modified ${formatRelativeTime(item.lastModifiedDate)}`}
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
        </View>

        {/* Classifier badge */}
        <View style={[cardStyles.classifierBadge, { backgroundColor: role.surface }]}>
          <Icon name={classifierIcon(item.classifier)} size={12} color={role.base} />
          <Text style={[cardStyles.classifierText, { color: role.base }]}>
            {classifierLabel(item.classifier)}
          </Text>
        </View>
      </View>

      {/* Meta info row */}
      <View style={cardStyles.metaRow}>
        <View style={cardStyles.metaItem}>
          <Icon name="account-outline" size={13} color={t.color.text.tertiary} />
          <Text
            style={[typeScale.bodySmall, cardStyles.metaText, { color: t.color.text.secondary }]}
            numberOfLines={1}
          >
            {item.ownerName}
          </Text>
        </View>
      </View>

      {/* Footer: last modified */}
      <View style={[cardStyles.footer, { borderTopColor: t.color.border.subtle }]}>
        <View style={cardStyles.footerItem}>
          <Icon name="clock-outline" size={13} color={t.color.text.tertiary} />
          <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
            Modified {formatRelativeTime(item.lastModifiedDate)}
          </Text>
        </View>
        <View style={cardStyles.footerItem}>
          <Icon name="calendar-outline" size={13} color={t.color.text.tertiary} />
          <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
            Created {formatRelativeTime(item.createdDate)}
          </Text>
        </View>
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
  classifierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    gap: 5,
  },
  classifierText: { ...typeScale.micro, fontWeight: '700', letterSpacing: 0.6 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metaText: {
    marginLeft: spacing.xs,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});

// -- Loading placeholder ----------------------------------------------------

const ProjectListSkeleton: React.FC = () => {
  const t = useTokens();
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading projects">
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonCard,
            { backgroundColor: t.color.surface.raised, borderColor: t.color.border.subtle },
          ]}
        >
          <View style={styles.skeletonHeader}>
            <Skeleton width="50%" height={16} />
            <Skeleton width={82} height={22} radius={radii.sm} />
          </View>
          <Skeleton width="40%" height={12} />
          <Skeleton width="75%" height={11} />
        </View>
      ))}
    </View>
  );
};

// -- Main Component ---------------------------------------------------------

const ProjectsScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();

  const {
    data: projectsData,
    isLoading,
    error,
    refetch,
  } = useProjects();

  const pullRefresh = usePullRefresh(refetch);

  const projects = useMemo(() => {
    if (Array.isArray(projectsData)) return projectsData;
    if (projectsData && typeof projectsData === 'object' && 'data' in (projectsData as any)) {
      return (projectsData as any).data ?? [];
    }
    return [];
  }, [projectsData]);

  const handleProjectPress = useCallback(
    (project: DesignCenterProject) => {
      hapticLight();
      router.push({
        pathname: '/(main)/apis/project-detail' as any,
        params: { projectId: project.id },
      });
    },
    [router],
  );

  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typeScale.title, { color: t.color.text.primary }]}>Design Center</Text>
        {isLoading ? (
          <Skeleton width={92} height={12} style={styles.headerCountSkeleton} />
        ) : (
          <Text style={[typeScale.caption, styles.headerCount, { color: t.color.text.tertiary }]}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </Text>
        )}
      </View>

      {/* Projects list */}
      <FlatList
        data={isLoading ? [] : projects}
        keyExtractor={(item: DesignCenterProject) => item.id}
        renderItem={({ item }) => (
          <ProjectCard item={item} t={t} onPress={handleProjectPress} />
        )}
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
            <ProjectListSkeleton />
          ) : (
            // This list has no search or filter, so empty means empty —
            // say what a project is and how one gets here.
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
                <Icon name="pencil-ruler" size={32} color={t.color.text.tertiary} />
              </View>
              <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
                No design projects yet
              </Text>
              <Text style={[typeScale.bodySmall, styles.emptyBody, { color: t.color.text.secondary }]}>
                Design Center projects are the API specifications and Mule applications your
                organization authors — RAML and OAS specs, fragments, and Mule apps. Create one
                in Anypoint Design Center and it will appear here.
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
                  Projects are scoped to your organization, and you only see the ones you have
                  access to. Check the organization selected in Settings if you expected more.
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
    marginBottom: spacing.md,
  },
  headerCount: {
    marginTop: 2,
  },
  headerCountSkeleton: {
    marginTop: 4,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
});

export default ProjectsScreen;
