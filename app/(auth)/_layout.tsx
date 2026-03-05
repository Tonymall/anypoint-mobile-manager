import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen
        name="sso"
        options={{ headerShown: true, title: 'Single Sign-On', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="select-org" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="select-env" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
