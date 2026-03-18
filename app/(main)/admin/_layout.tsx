import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function AdminLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="user-detail" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="governance" />
      <Stack.Screen name="environment-comparison" />
      <Stack.Screen name="platform-activity" />
      <Stack.Screen name="usage-reports" />
      <Stack.Screen name="monitoring-deep-dive" />
      <Stack.Screen name="visualizer-topology" />
      <Stack.Screen name="runtime-fabric" />
      <Stack.Screen name="cloud-network" />
      <Stack.Screen name="cloudhub-notifications" />
      <Stack.Screen name="api-control-plane" />
      <Stack.Screen name="connected-apps" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="business-groups" />
      <Stack.Screen name="secrets" />
      <Stack.Screen name="secret-detail" />
      <Stack.Screen name="backend-ops" />
    </Stack>
  );
}
