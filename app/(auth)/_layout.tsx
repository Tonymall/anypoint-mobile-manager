import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen
        name="sso"
        options={{ headerShown: true, title: 'Single Sign-On' }}
      />
    </Stack>
  );
}
