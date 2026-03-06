// ============================================================
// Connected App Login Screen
//
// OAuth2 client_credentials flow for Connected Apps.
// Fields: Client ID, Client Secret, Region selector.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Snackbar,
  useTheme,
  ActivityIndicator,
  Divider,
  Menu,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../stores';
import * as authService from '../../services/authService';
import { setRegion, setAuthHeader, storeTokens } from '../../services/api';
import { CONTROL_PLANE_REGIONS, getRegionById, getRegionUrl } from '../../config/regions';
import type { ControlPlaneRegionId } from '../../types';
import AnimatedBackground from '../../components/common/AnimatedBackground';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import { anypointColors } from '../../theme';
import logger from '../../utils/logger';

const ConnectedAppLoginScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const setSelectedRegion = useAuthStore((s) => s.setSelectedRegion);
  const loginPending = useAuthStore((s) => s.loginPending);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [secureEntry, setSecureEntry] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);

  const handleRegionSelect = useCallback(
    (regionId: ControlPlaneRegionId) => {
      setSelectedRegion(regionId);
      setRegion(regionId);
      setRegionMenuVisible(false);
    },
    [setSelectedRegion],
  );

  const handleLogin = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const regionUrl = getRegionUrl(selectedRegion);
      logger.log('[ConnectedApp] Attempting client_credentials login');

      // 1. Get token via client_credentials
      const tokens = await authService.loginWithConnectedApp(
        clientId.trim(),
        clientSecret.trim(),
        regionUrl,
      );

      if (!tokens.accessToken) {
        throw new Error('No access token received from Connected App flow.');
      }

      // 2. Set auth headers
      setAuthHeader(tokens.accessToken);
      await storeTokens(tokens.accessToken);

      // 3. Get user profile
      const user = await authService.getCurrentUser(tokens.accessToken, regionUrl);
      logger.log('[ConnectedApp] Login successful, user:', user.username);

      loginPending(user, tokens);
      hapticSuccess();
      router.push('/(auth)/select-org' as any);
    } catch (error: any) {
      logger.error('[ConnectedApp] Login failed:', { message: error?.message });
      const message =
        error?.response?.data?.error_description ??
        error?.response?.data?.message ??
        error?.message ??
        'Connected App authentication failed. Check your Client ID and Secret.';
      setErrorMessage(message);
      hapticError();
      setSnackbarVisible(true);
    } finally {
      setIsLoading(false);
    }
  }, [clientId, clientSecret, selectedRegion, isLoading, loginPending, router]);

  const isFormValid = clientId.trim().length > 0 && clientSecret.trim().length > 0;
  const currentRegion = getRegionById(selectedRegion);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AnimatedBackground />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.innerContent}>
          {/* Header */}
          <View style={styles.headerArea}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Icon name="arrow-left" size={24} color={theme.colors.onSurface} />
            </Pressable>
            <View style={[styles.iconBox, { backgroundColor: anypointColors.primary + '18' }]}>
              <Icon name="connection" size={36} color={anypointColors.primary} />
            </View>
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.onSurface, fontWeight: '700', marginTop: 16 }}
            >
              Connected App
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 6 }}
            >
              Sign in using OAuth2 client credentials
            </Text>
          </View>

          {/* Form Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface + 'E6',
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            {/* Region Selector */}
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}
            >
              Control Plane Region
            </Text>
            <Menu
              visible={regionMenuVisible}
              onDismiss={() => setRegionMenuVisible(false)}
              anchor={
                <Pressable onPress={() => setRegionMenuVisible(true)} disabled={isLoading}>
                  <View
                    style={[
                      styles.regionSelector,
                      { borderColor: theme.colors.outline, backgroundColor: theme.colors.background },
                    ]}
                  >
                    <View style={styles.regionLeft}>
                      <Icon name="earth" size={18} color={theme.colors.primary} />
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
                        {currentRegion.label}
                      </Text>
                    </View>
                    <Icon name="chevron-down" size={20} color={theme.colors.onSurfaceVariant} />
                  </View>
                </Pressable>
              }
              contentStyle={{ backgroundColor: theme.colors.surface }}
            >
              {CONTROL_PLANE_REGIONS.map((region) => (
                <Menu.Item
                  key={region.id}
                  title={`${region.label} — ${region.notes}`}
                  leadingIcon={selectedRegion === region.id ? 'check-circle' : 'earth'}
                  onPress={() => handleRegionSelect(region.id)}
                />
              ))}
            </Menu>

            <Divider style={{ marginVertical: 16 }} />

            {/* Client ID */}
            <TextInput
              label="Client ID"
              value={clientId}
              onChangeText={setClientId}
              mode="outlined"
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isLoading}
              left={<TextInput.Icon icon="identifier" />}
              style={styles.input}
            />

            {/* Client Secret */}
            <TextInput
              label="Client Secret"
              value={clientSecret}
              onChangeText={setClientSecret}
              mode="outlined"
              secureTextEntry={secureEntry}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={isLoading}
              left={<TextInput.Icon icon="key" />}
              right={
                <TextInput.Icon
                  icon={secureEntry ? 'eye-off' : 'eye'}
                  onPress={() => setSecureEntry(!secureEntry)}
                />
              }
              style={styles.input}
            />

            {/* Submit */}
            <Button
              mode="contained"
              onPress={handleLogin}
              disabled={!isFormValid || isLoading}
              icon={isLoading ? undefined : 'login'}
              style={styles.submitBtn}
              contentStyle={styles.submitBtnContent}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                'Get Access Token'
              )}
            </Button>
          </View>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={5000}
        style={{ backgroundColor: anypointColors.error }}
      >
        {errorMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },
  innerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 440, alignSelf: 'center', width: '100%' },
  headerArea: { alignItems: 'center', marginBottom: 24, width: '100%' },
  backBtn: { position: 'absolute', top: 0, left: 0, padding: 8 },
  iconBox: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  card: { width: '100%', borderRadius: 20, borderWidth: 1, padding: 24 },
  regionSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 12 },
  regionLeft: { flexDirection: 'row', alignItems: 'center' },
  input: { marginBottom: 14 },
  submitBtn: { marginTop: 8, borderRadius: 14 },
  submitBtnContent: { paddingVertical: 6 },
});

export default ConnectedAppLoginScreen;
