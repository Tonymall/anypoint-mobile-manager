import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  Text,
  Surface,
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

const OrgSelectScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();

  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: organizations, isLoading, error } = useOrganizations();

  // Auto-select if only one org
  useEffect(() => {
    if (organizations && organizations.length === 1) {
      handleSelect(organizations[0]);
    }
  }, [organizations]);

  const handleSelect = useCallback(
    (org: Organization) => {
      // Clear old org data now that user has made a selection
      queryClient.clear();
      clearHeaders();
      switchOrganization(org);
      setOrganizationHeader(org.id);
      // Pass fromSettings along so EnvSelectScreen knows the flow origin
      router.push({ pathname: '/(auth)/select-env' as any, params: { fromSettings: fromSettings ?? '' } });
    },
    [switchOrganization, router, fromSettings, queryClient],
  );

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
        style={[styles.orgCard, { backgroundColor: theme.colors.surface }]}
        rippleColor={theme.colors.primaryContainer}
      >
        <View style={styles.orgRow}>
          <View
            style={[
              styles.orgIcon,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon name="domain" size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.orgInfo}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, fontWeight: '600' }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
              numberOfLines={1}
            >
              {item.id}
            </Text>
          </View>
          <Icon
            name="chevron-right"
            size={22}
            color={theme.colors.onSurfaceVariant}
          />
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
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Icon name="domain" size={32} color={theme.colors.primary} />
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}
          >
            Loading organizations...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.error, marginTop: 12 }}
          >
            Failed to load organizations
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          >
            {(error as Error).message}
          </Text>
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
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  orgCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  orgIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
});

export default OrgSelectScreen;
