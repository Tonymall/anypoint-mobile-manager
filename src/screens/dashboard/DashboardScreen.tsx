// ============================================================
// Dashboard Screen - Overview of Anypoint Platform health
// Shows app counts, alerts, and quick stats
// ============================================================

import React, { useMemo } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  Card,
  useTheme,
  Divider,
  Button,
  Avatar,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../stores/authStore';
import { getRegionById } from '../../config/regions';
import { anypointColors } from '../../theme';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle?: string;
  onPress?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
  onPress,
}) => {
  const theme = useTheme();
  return (
    <Card
      style={[statCardStyles.card, { backgroundColor: theme.colors.surface }]}
      mode="elevated"
      onPress={onPress}
    >
      <Card.Content style={statCardStyles.content}>
        <View style={[statCardStyles.iconCircle, { backgroundColor: color + '20' }]}>
          <Icon name={icon} size={24} color={color} />
        </View>
        <Text variant="headlineSmall" style={[statCardStyles.value, { color: theme.colors.onSurface }]}>
          {value}
        </Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="bodySmall" style={{ color }}>
            {subtitle}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

const statCardStyles = StyleSheet.create({
  card: { width: '47%', marginHorizontal: 4, borderRadius: 12 },
  content: { alignItems: 'center', paddingVertical: 16 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value: { fontWeight: '700', marginBottom: 2 },
});

const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useAuthStore((s) => s.user);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const region = getRegionById(selectedRegion);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header / Greeting */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Avatar.Text
            size={48}
            label={
              user
                ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
                : '?'
            }
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{ color: theme.colors.primary }}
          />
          <View style={styles.headerText}>
            <Text variant="titleLarge" style={{ color: theme.colors.onBackground }}>
              {greeting}, {user?.firstName ?? 'User'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {currentOrg?.name ?? user?.organizationName ?? 'Organization'} — {region.label}
            </Text>
          </View>
        </View>
      </View>

      <Divider style={styles.divider} />

      {/* Quick Stats */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
        Platform Overview
      </Text>

      <View style={styles.statsGrid}>
        <StatCard
          title="Applications"
          value={8}
          icon="application-cog"
          color={anypointColors.primary}
          subtitle="6 running"
          onPress={() => navigation.navigate('Runtime')}
        />
        <StatCard
          title="APIs"
          value={6}
          icon="api"
          color={anypointColors.secondary}
          subtitle="4 active"
          onPress={() => navigation.navigate('APIs')}
        />
        <StatCard
          title="Alerts"
          value={3}
          icon="bell-alert"
          color={anypointColors.warning}
          subtitle="1 critical"
        />
        <StatCard
          title="Workers"
          value={13}
          icon="server"
          color={anypointColors.accent}
          subtitle="Across all envs"
        />
      </View>

      {/* Recent Activity */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
        Recent Activity
      </Text>

      <Card style={styles.activityCard} mode="elevated">
        <Card.Content>
          {[
            { icon: 'rocket-launch', text: 'shipping-eapi deployed to CloudHub', time: '2m ago', color: anypointColors.success },
            { icon: 'alert-circle', text: 'payment-gateway entered FAILED state', time: '1h ago', color: anypointColors.error },
            { icon: 'check-circle', text: 'Orders API v2.0 contract approved', time: '3h ago', color: anypointColors.success },
            { icon: 'cog-sync', text: 'inventory-sync-worker scaled to 3 replicas', time: '5h ago', color: anypointColors.info },
          ].map((item, i) => (
            <View key={i}>
              <View style={styles.activityRow}>
                <Icon name={item.icon} size={20} color={item.color} />
                <View style={styles.activityText}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                    {item.text}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.time}
                  </Text>
                </View>
              </View>
              {i < 3 && <Divider style={styles.activityDivider} />}
            </View>
          ))}
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
        Quick Actions
      </Text>

      <View style={styles.actionsRow}>
        <Button
          mode="outlined"
          icon="rocket-launch"
          style={styles.actionButton}
          onPress={() => {}}
        >
          Deploy
        </Button>
        <Button
          mode="outlined"
          icon="text-box-search"
          style={styles.actionButton}
          onPress={() => {}}
        >
          View Logs
        </Button>
        <Button
          mode="outlined"
          icon="chart-line"
          style={styles.actionButton}
          onPress={() => {}}
        >
          Metrics
        </Button>
      </View>
    </ScrollView>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerText: {
      marginLeft: 14,
      flex: 1,
    },
    divider: {
      marginHorizontal: 20,
      marginBottom: 8,
    },
    sectionTitle: {
      fontWeight: '600',
      paddingHorizontal: 20,
      marginTop: 20,
      marginBottom: 12,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      gap: 8,
    },
    activityCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 10,
      gap: 12,
    },
    activityText: {
      flex: 1,
    },
    activityDivider: {
      marginLeft: 32,
    },
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 8,
    },
    actionButton: {
      flex: 1,
      borderRadius: 8,
    },
  });

export default DashboardScreen;
