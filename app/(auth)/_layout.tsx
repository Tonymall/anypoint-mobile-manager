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
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      {/* The screen draws its own Appbar; a navigator header on top of it
          stacked two title bars ("Single Sign-On" above "Verify Identity"). */}
      <Stack.Screen name="sso" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="select-org" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="select-env" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="terms"
        options={{ animation: 'slide_from_right', gestureEnabled: false }}
      />
    </Stack>
  );
}
