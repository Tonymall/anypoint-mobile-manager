// ============================================================
// Anypoint Mobile Platform - Login Screen
// Username/password authentication with region selector,
// SSO, and biometric options
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Switch,
  Snackbar,
  useTheme,
  ActivityIndicator,
  Divider,
  Menu,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../stores';
import * as authService from '../../services/authService';
import { setRegion } from '../../services/api';
import { CONTROL_PLANE_REGIONS, getRegionById } from '../../config/regions';
import type { AuthTokens, User, ControlPlaneRegionId } from '../../types';

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const theme = useTheme();

  // --- Form State ---
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);

  // --- Region State ---
  const selectedRegion = useAuthStore((state) => state.selectedRegion);
  const setSelectedRegion = useAuthStore((state) => state.setSelectedRegion);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);

  // --- UI State ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);

  // --- Store ---
  const login = useAuthStore((state) => state.login);
  const setIsLoadingStore = useAuthStore((state) => state.setIsLoading);

  // --- Handlers ---
  const handleRegionSelect = useCallback(
    async (regionId: ControlPlaneRegionId) => {
      setSelectedRegion(regionId);
      await setRegion(regionId);
      setRegionMenuVisible(false);
    },
    [setSelectedRegion],
  );

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      setSnackbarVisible(true);
      return;
    }

    setIsLoading(true);
    setIsLoadingStore(true);
    setErrorMessage('');

    try {
      // Ensure the API client points to the selected region
      await setRegion(selectedRegion);

      const tokens: AuthTokens = await authService.login({
        username: username.trim(),
        password,
      });

      const user: User = await authService.getCurrentUser();

      login(user, tokens);
      // Navigation to main app is handled by the auth navigator
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Authentication failed. Please check your credentials and try again.';
      setErrorMessage(message);
      setSnackbarVisible(true);
    } finally {
      setIsLoading(false);
      setIsLoadingStore(false);
    }
  }, [username, password, selectedRegion, login, setIsLoadingStore]);

  const handleSSOLogin = useCallback(() => {
    navigation.navigate('SSOLogin');
  }, [navigation]);

  const handleBiometricToggle = useCallback((value: boolean) => {
    setBiometricEnabled(value);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  const isFormValid = username.trim().length > 0 && password.trim().length > 0;
  const currentRegion = getRegionById(selectedRegion);

  // --- Render ---
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding Area */}
        <View style={styles.brandingContainer}>
          <View
            style={[
              styles.logoCircle,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon
              name="api"
              size={48}
              color={theme.colors.primary}
            />
          </View>
          <Text
            variant="headlineMedium"
            style={[styles.appTitle, { color: theme.colors.onBackground }]}
          >
            Anypoint Platform
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.appSubtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            Mobile Management Console
          </Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          {/* Region Selector */}
          <Menu
            visible={regionMenuVisible}
            onDismiss={() => setRegionMenuVisible(false)}
            anchor={
              <Pressable
                onPress={() => setRegionMenuVisible(true)}
                disabled={isLoading}
              >
                <View
                  style={[
                    styles.regionSelector,
                    {
                      borderColor: theme.colors.outline,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <View style={styles.regionLeft}>
                    <Icon
                      name="earth"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <View style={styles.regionTextContainer}>
                      <Text
                        variant="labelSmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        Control Plane
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurface }}
                      >
                        {currentRegion.label} — {currentRegion.notes}
                      </Text>
                    </View>
                  </View>
                  <Icon
                    name="chevron-down"
                    size={20}
                    color={theme.colors.onSurfaceVariant}
                  />
                </View>
              </Pressable>
            }
            contentStyle={{ backgroundColor: theme.colors.surface }}
          >
            {CONTROL_PLANE_REGIONS.map((region) => (
              <Menu.Item
                key={region.id}
                title={`${region.label} — ${region.notes}`}
                leadingIcon={
                  selectedRegion === region.id ? 'check' : 'earth'
                }
                onPress={() => handleRegionSelect(region.id)}
              />
            ))}
          </Menu>

          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            left={<TextInput.Icon icon="account-outline" />}
            disabled={isLoading}
            style={styles.input}
            returnKeyType="next"
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            disabled={isLoading}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {/* Biometric Toggle */}
          <View style={styles.biometricRow}>
            <View style={styles.biometricLabel}>
              <Icon
                name="fingerprint"
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodyMedium"
                style={[styles.biometricText, { color: theme.colors.onSurfaceVariant }]}
              >
                Enable Biometric Login
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              disabled={isLoading}
            />
          </View>

          {/* Sign In Button */}
          <Button
            mode="contained"
            onPress={handleLogin}
            disabled={!isFormValid || isLoading}
            loading={isLoading}
            style={styles.signInButton}
            contentStyle={styles.signInButtonContent}
            labelStyle={styles.signInButtonLabel}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </Button>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <Divider style={styles.dividerLine} />
            <Text
              variant="labelMedium"
              style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}
            >
              or
            </Text>
            <Divider style={styles.dividerLine} />
          </View>

          {/* SSO Button */}
          <Button
            mode="outlined"
            onPress={handleSSOLogin}
            disabled={isLoading}
            icon="shield-key-outline"
            style={styles.ssoButton}
            contentStyle={styles.ssoButtonContent}
          >
            Sign in with SSO
          </Button>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            MuleSoft Anypoint Platform
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.outline }}
          >
            Version 1.0.0
          </Text>
        </View>

        {/* Loading Overlay */}
        {isLoading && (
          <View
            style={[
              styles.loadingOverlay,
              { backgroundColor: theme.dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.6)' },
            ]}
          >
            <ActivityIndicator
              animating
              size="large"
              color={theme.colors.primary}
            />
          </View>
        )}
      </ScrollView>

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={4000}
        action={{
          label: 'Dismiss',
          onPress: dismissSnackbar,
        }}
        style={styles.snackbar}
      >
        {errorMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  brandingContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  appSubtitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  regionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  regionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  regionTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  input: {
    marginBottom: 16,
  },
  biometricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  biometricLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  biometricText: {
    marginLeft: 8,
  },
  signInButton: {
    marginBottom: 16,
    borderRadius: 8,
  },
  signInButtonContent: {
    paddingVertical: 6,
  },
  signInButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  ssoButton: {
    borderRadius: 8,
  },
  ssoButtonContent: {
    paddingVertical: 6,
  },
  footer: {
    alignItems: 'center',
    marginTop: 48,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snackbar: {
    marginBottom: 16,
  },
});

export default LoginScreen;
