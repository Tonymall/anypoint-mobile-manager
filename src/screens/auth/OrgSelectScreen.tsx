// ============================================================
// Organization Selection Screen - 2026 Modern Design
// ============================================================

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  TouchableRipple,
  Appbar,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useOrganizations } from '../../hooks/queries';
import { setOrganizationHeader, clearHeaders } from '../../services/api';
import type { Organization } from '../../types';
import { hapticLight } from '../../utils/haptics';
import logger from '../../utils/logger';

const OrgSelectScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const _insets = useSafeAreaInsets();
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();

  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: organizations, isLoading, error } = useOrganizations();

  const handleSelect = useCallback(
    (org: Organization) => {
      hapticLight();
      logger.log('[OrgSelect] Selected org:', org.name, org.id);
      queryClient.clear();
      clearHeaders();
      switchOrganization(org);
      setOrganizationHeader(org.id);
      logger.log('[OrgSelect] Org header set, navigating to select-env');
      router.push({ pathname: '/(auth)/select-env' as any, params: { fromSettings: fromSettings ?? '' } });
    },
    [switchOrganization, router, fromSettings, queryClient],
  );

  // Auto-select if only one org
  useEffect(() => {
    if (organizations && organizations.length === 1) {
      handleSelect(organizations[0]);
    }
  }, [organizations, handleSelect]);

  const handleBack = useCallback(() => {
    if (fromSettings === '1') {
      router.replace('/(main)/settings' as any);
    } else {
      router.back();
    }
  }, [router, fromSettings]);

  const renderOrg = useCallback(
    ({ item }: { item: Organization }) => (
      <TouchableRipple
        onPress={() => handleSelect(item)}
        borderless
        style={[styles.orgCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
        rippleColor={theme.colors.primaryContainer}
        accessibilityLabel={`Organization: ${item.name}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to select"
      >
        <View style={styles.orgRow}>
          <View
            style={[
              styles.orgIcon,
              { backgroundColor: theme.colors.primary + '14' },
            ]}
          >
            <Icon name="domain" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.orgInfo}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, fontWeight: '600', letterSpacing: -0.2 }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace', fontSize: 11 }}
              numberOfLines={1}
            >
              {item.id}
            </Text>
          </View>
          <View style={[styles.chevronCircle, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
          </View>
        </View>
      </TouchableRipple>
    ),
    [handleSelect, theme],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      {/* Back button header */}
      <Appbar.Header style={{ backgroundColor: 'transparent', elevation: 0 }}>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title="" />
      </Appbar.Header>

      <View style={styles.header}>
        <View
          style={[
            styles.headerIcon,
            { backgroundColor: theme.colors.primary + '14' },
          ]}
        >
          <Icon name="domain" size={30} color={theme.colors.primary} />
        </View>
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Select Organization
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
        >
          Welcome, {user?.firstName ?? user?.username}. Choose an organization to
          continue.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <View style={[styles.loadingBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}
            >
              Loading organizations...
            </Text>
          </View>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <View style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer + '30' }]}>
            <Icon name="alert-circle-outline" size={40} color={theme.colors.error} />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.error, marginTop: 12 }}
            >
              Failed to load organizations
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}
            >
              {(error as Error).message}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={organizations}
          keyExtractor={(item) => item.id}
          renderItem={renderOrg}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 32,
  },
  headerIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingBox: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
    maxWidth: 320,
  },
  errorBox: {
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  orgCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  orgIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default OrgSelectScreen;
