import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function AlertsLayout() {
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
      <Stack.Screen name="detail" />
      <Stack.Screen name="create-rule" />
    </Stack>
  );
}
