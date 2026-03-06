// ============================================================
// Design Center - Project Detail Screen
// 2026 Modern Dark-First Design with glassmorphic cards,
// accent borders, and admin delete action.
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  Portal,
  Snackbar,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { DesignCenterProject } from '../../types';
import { anypointColors } from '../../theme';
import { useProjects } from '../../hooks/queries/useDesignCenterQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticWarning } from '../../utils/haptics';
import { ConfirmDialog } from '../../components/common';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

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

const classifierIcon = (classifier?: string | null): string => {
  if (!classifier) return 'file-document-outline';
  const map: Record<string, string> = {
    raml: 'api',
    oas: 'api',
    'raml-fragment': 'puzzle-outline',
    mule: 'application-brackets-outline',
    wsdl: 'xml',
    graphql: 'graphql',
  };
  return map[classifier.toLowerCase()] ?? 'file-document-outline';
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

// -- Main Screen ------------------------------------------------------------

const ProjectDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  // Fetch all projects and find the one matching projectId
  const {
    data: projectsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useProjects();

  const project: DesignCenterProject | undefined = useMemo(() => {
    const list = Array.isArray(projectsData)
      ? projectsData
      : (projectsData && typeof projectsData === 'object' && 'data' in (projectsData as any))
        ? (projectsData as any).data ?? []
        : [];
    return list.find((p: DesignCenterProject) => p.id === projectId);
  }, [projectsData, projectId]);

  const handleBack = useCallback(() => router.back(), [router]);

  const showSnack = useCallback((msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const handleDeletePress = useCallback(() => {
    hapticWarning();
    setConfirmDeleteVisible(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setConfirmDeleteVisible(false);
    // Delete not yet implemented for MVP -- show feedback
    showSnack('Delete project is not yet available.');
  }, [showSnack]);

  const handleDeleteCancel = useCallback(() => {
    setConfirmDeleteVisible(false);
  }, []);

  // -- Loading / Error states --
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
          <Appbar.Content title="Project" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <LoadingState message="Loading project details..." />
      </View>
    );
  }

  if (isError || !project) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
          <Appbar.Content title="Project" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load project details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const clsColor = classifierColor(project.classifier);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={handleBack} accessibilityLabel="Go back" />
        <Appbar.Content
          title={project.name}
          titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }}
        />
        <Appbar.Action icon="refresh" onPress={() => refetch()} accessibilityLabel="Refresh" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Project Header Card */}
        <View style={[styles.headerCard, { borderLeftColor: clsColor, borderColor: theme.colors.outlineVariant }]}>
          <View style={[styles.headerGlow, { backgroundColor: clsColor }]} />
          <View style={styles.headerContent}>
            {/* Name + Classifier badge */}
            <View style={styles.headerRow}>
              <View style={[styles.classifierIconBox, { backgroundColor: clsColor + '14' }]}>
                <Icon name={classifierIcon(project.classifier)} size={22} color={clsColor} />
              </View>
              <View style={styles.headerTitleWrap}>
                <Text
                  variant="titleLarge"
                  style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.3 }}
                  numberOfLines={2}
                >
                  {project.name}
                </Text>
                <View style={[styles.classifierBadge, { backgroundColor: clsColor + '18', marginTop: 8 }]}>
                  <Text style={[styles.classifierText, { color: clsColor }]}>
                    {classifierLabel(project.classifier)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Project Information */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: anypointColors.primary }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            PROJECT INFORMATION
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <InfoItem
            label="Name"
            value={project.name}
            icon="pencil-outline"
            iconColor={theme.colors.primary}
          />
          <InfoItem
            label="Classifier"
            value={classifierLabel(project.classifier)}
            icon="tag-outline"
            iconColor={clsColor}
          />
          <InfoItem
            label="Owner"
            value={project.ownerName}
            icon="account-outline"
            iconColor={anypointColors.accent}
          />
          <InfoItem
            label="Organization"
            value={project.organizationId}
            icon="domain"
            iconColor={anypointColors.secondary}
          />
          <InfoItem
            label="Created"
            value={formatRelativeTime(project.createdDate)}
            icon="calendar-plus"
            iconColor={anypointColors.info}
          />
          <InfoItem
            label="Modified"
            value={formatRelativeTime(project.lastModifiedDate)}
            icon="clock-outline"
            iconColor={anypointColors.warning}
          />
          <InfoItem
            label="Project ID"
            value={project.id}
            icon="identifier"
            iconColor={theme.colors.onSurfaceVariant}
          />
        </View>

        {/* Admin Actions */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: anypointColors.error }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            ADMIN ACTIONS
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <Pressable
            onPress={handleDeletePress}
            accessibilityLabel="Delete project"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.deleteButton,
              {
                backgroundColor: anypointColors.error + '14',
                borderColor: anypointColors.error + '30',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Icon name="delete-outline" size={16} color={anypointColors.error} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: anypointColors.error,
                letterSpacing: 0.2,
              }}
            >
              Delete Project
            </Text>
          </Pressable>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 10, lineHeight: 18 }}
          >
            Permanently delete this project and all its contents. This action cannot be undone.
          </Text>
        </View>
      </ScrollView>

      {/* Confirm Delete Dialog */}
      <Portal>
        <ConfirmDialog
          visible={confirmDeleteVisible}
          title="Delete Project"
          message={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      </Portal>

      {/* Snackbar */}
      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={3000}
        action={{ label: 'OK', onPress: () => setSnackVisible(false) }}
      >
        {snackMsg}
      </Snackbar>
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
      alignItems: 'flex-start',
      gap: 14,
    },
    headerTitleWrap: {
      flex: 1,
    },
    classifierIconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    classifierBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    classifierText: {
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
    // -- Delete Button --
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
    },
  });

export default ProjectDetailScreen;

