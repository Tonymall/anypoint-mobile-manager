// ============================================================
// Design Center - Projects List Screen
// 2026 Modern Dark-First Design with glassmorphic cards,
// accent borders, classifier badges, and pull-to-refresh.
// ============================================================

import React, { useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useRouter } from 'expo-router';
import type { DesignCenterProject } from '../../types';
import { anypointColors } from '../../theme';
import { useProjects } from '../../hooks/queries/useDesignCenterQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import type { IconName } from '../../types/icons';

// -- Helpers ----------------------------------------------------------------

const classifierColor = (classifier?: string | null): string => {
  if (!classifier) return anypointColors.primaryDark;
  const map: Record<string, string> = {
    raml: anypointColors.primary,
    oas: anypointColors.accent,
    'raml-fragment': anypointColors.secondary,
    mule: anypointColors.muleGreen,
    wsdl: anypointColors.mulePurple,
    graphql: anypointColors.warning,
  };
  return map[classifier.toLowerCase()] ?? anypointColors.primaryDark;
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
  theme: MD3Theme;
  onPress: (item: DesignCenterProject) => void;
}> = ({ item, theme, onPress }) => {
  const clsColor = classifierColor(item.classifier);

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityLabel={`Design Center project: ${item.name}, type ${classifierLabel(item.classifier)}, last modified ${formatRelativeTime(item.lastModifiedDate)}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          borderLeftColor: clsColor,
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
        </View>

        {/* Classifier badge */}
        <View style={[cardStyles.classifierBadge, { backgroundColor: clsColor + '18' }]}>
          <Icon name={classifierIcon(item.classifier)} size={12} color={clsColor} />
          <Text style={[cardStyles.classifierText, { color: clsColor }]}>
            {classifierLabel(item.classifier)}
          </Text>
        </View>
      </View>

      {/* Meta info row */}
      <View style={cardStyles.metaRow}>
        <View style={cardStyles.metaItem}>
          <Icon name="account-outline" size={13} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }} numberOfLines={1}>
            {item.ownerName}
          </Text>
        </View>
      </View>

      {/* Footer: last modified */}
      <View style={[cardStyles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
        <View style={cardStyles.footerItem}>
          <Icon name="clock-outline" size={13} color={theme.colors.onSurfaceVariant} />
          <Text style={[cardStyles.footerText, { color: theme.colors.onSurfaceVariant }]}>
            Modified {formatRelativeTime(item.lastModifiedDate)}
          </Text>
        </View>
        <View style={cardStyles.footerItem}>
          <Icon name="calendar-outline" size={13} color={theme.colors.onSurfaceVariant} />
          <Text style={[cardStyles.footerText, { color: theme.colors.onSurfaceVariant }]}>
            Created {formatRelativeTime(item.createdDate)}
          </Text>
        </View>
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
  classifierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  classifierText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

// -- Main Component ---------------------------------------------------------

const ProjectsScreen: React.FC = () => {
  const theme = useTheme<MD3Theme>();
  const router = useRouter();

  const {
    data: projectsData,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useProjects();

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

  if (isLoading) {
    return <LoadingState message="Loading projects..." />;
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
          Design Center
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </Text>
      </View>

      {/* Projects list */}
      <FlatList
        data={projects}
        keyExtractor={(item: DesignCenterProject) => item.id}
        renderItem={({ item }) => (
          <ProjectCard item={item} theme={theme} onPress={handleProjectPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon name="pencil-ruler" size={32} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              No projects found
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Create a project in Anypoint Design Center to get started
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
    marginBottom: 12,
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

export default ProjectsScreen;
