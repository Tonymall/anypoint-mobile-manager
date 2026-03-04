import React from 'react';
import { Platform } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../src/stores/authStore';

export default function MainLayout() {
  const theme = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Icon name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="runtime"
        options={{
          title: 'Runtime',
          tabBarIcon: ({ color, size }) => (
            <Icon name="application-cog" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="apis"
        options={{
          title: 'APIs',
          tabBarIcon: ({ color, size }) => (
            <Icon name="api" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Monitoring',
          tabBarIcon: ({ color, size }) => (
            <Icon name="chart-line" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Icon name="cog" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden route — accessible via router.push but not shown in tab bar */}
      <Tabs.Screen
        name="workers"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
