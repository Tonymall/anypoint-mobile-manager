import React from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function MainLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: theme.colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
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
    </Tabs>
  );
}
