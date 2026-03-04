import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function AppIndex() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Redirect href="/(main)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
