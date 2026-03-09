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
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="user-detail" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="connected-apps" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="business-groups" />
      <Stack.Screen name="secrets" />
      <Stack.Screen name="secret-detail" />
      <Stack.Screen name="backend-ops" />
    </Stack>
  );
}
