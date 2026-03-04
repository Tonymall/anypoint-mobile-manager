// ============================================================
// Anypoint Mobile Platform - SSO Login Screen
// Provider selection and WebView-based SSO authentication flow
// ============================================================

import React, { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  Button,
  Card,
  RadioButton,
  useTheme,
  Appbar,
  Divider,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface SSOProvider {
  id: 'okta' | 'azure_ad' | 'saml';
  label: string;
  description: string;
  icon: string;
}

const SSO_PROVIDERS: SSOProvider[] = [
  {
    id: 'okta',
    label: 'Okta',
    description: 'Sign in with your Okta identity provider',
    icon: 'shield-check',
  },
  {
    id: 'azure_ad',
    label: 'Azure AD',
    description: 'Sign in with Microsoft Azure Active Directory',
    icon: 'microsoft-azure',
  },
  {
    id: 'saml',
    label: 'SAML 2.0',
    description: 'Sign in with your organization SAML provider',
    icon: 'certificate',
  },
];

interface SSOLoginScreenProps {
  navigation: any;
}

const SSOLoginScreen: React.FC<SSOLoginScreenProps> = ({ navigation }) => {
  const theme = useTheme();

  // --- State ---
  const [selectedProvider, setSelectedProvider] = useState<string>('okta');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showWebView, setShowWebView] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);

  // --- Handlers ---
  const handleBack = useCallback(() => {
    if (showWebView) {
      setShowWebView(false);
      setIsLoading(false);
    } else {
      navigation.goBack();
    }
  }, [navigation, showWebView]);

  const handleContinue = useCallback(() => {
    setIsLoading(true);
    setShowWebView(true);

    // Placeholder: In production this would open a WebView with the
    // SSO provider's authorization URL. For now we simulate the flow.
    setTimeout(() => {
      setIsLoading(false);
      setErrorMessage(
        'SSO authentication is not yet configured for this environment. Please contact your administrator.',
      );
      setSnackbarVisible(true);
      setShowWebView(false);
    }, 2000);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  const selectedProviderData = SSO_PROVIDERS.find(
    (p) => p.id === selectedProvider,
  );

  // --- Render ---
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title="Single Sign-On" />
      </Appbar.Header>

      {showWebView ? (
        // --- WebView Placeholder ---
        <View style={styles.webViewPlaceholder}>
          <ActivityIndicator
            animating={isLoading}
            size="large"
            color={theme.colors.primary}
          />
          <Text
            variant="bodyLarge"
            style={[styles.webViewText, { color: theme.colors.onSurfaceVariant }]}
          >
            {isLoading
              ? `Connecting to ${selectedProviderData?.label ?? 'SSO provider'}...`
              : 'Waiting for authentication...'}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.webViewHint, { color: theme.colors.outline }]}
          >
            A browser window will open for authentication.
            {'\n'}You will be redirected back after signing in.
          </Text>
          <Button
            mode="outlined"
            onPress={handleBack}
            style={styles.cancelButton}
          >
            Cancel
          </Button>
        </View>
      ) : (
        // --- Provider Selection ---
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Instructions */}
          <View style={styles.instructionContainer}>
            <Icon
              name="shield-key-outline"
              size={40}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={[styles.instructionTitle, { color: theme.colors.onBackground }]}
            >
              Choose your Identity Provider
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.instructionBody, { color: theme.colors.onSurfaceVariant }]}
            >
              Select the SSO provider configured by your organization to
              authenticate with the Anypoint Platform.
            </Text>
          </View>

          <Divider style={styles.divider} />

          {/* Provider List */}
          <RadioButton.Group
            value={selectedProvider}
            onValueChange={setSelectedProvider}
          >
            {SSO_PROVIDERS.map((provider) => (
              <Card
                key={provider.id}
                style={[
                  styles.providerCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor:
                      selectedProvider === provider.id
                        ? theme.colors.primary
                        : theme.colors.outlineVariant,
                    borderWidth: selectedProvider === provider.id ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedProvider(provider.id)}
                mode="outlined"
              >
                <Card.Content style={styles.providerContent}>
                  <View style={styles.providerLeft}>
                    <View
                      style={[
                        styles.providerIconCircle,
                        {
                          backgroundColor:
                            selectedProvider === provider.id
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                        },
                      ]}
                    >
                      <Icon
                        name={provider.icon}
                        size={24}
                        color={
                          selectedProvider === provider.id
                            ? theme.colors.primary
                            : theme.colors.onSurfaceVariant
                        }
                      />
                    </View>
                    <View style={styles.providerTextContainer}>
                      <Text
                        variant="titleSmall"
                        style={{ color: theme.colors.onSurface }}
                      >
                        {provider.label}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                        numberOfLines={2}
                      >
                        {provider.description}
                      </Text>
                    </View>
                  </View>
                  <RadioButton value={provider.id} />
                </Card.Content>
              </Card>
            ))}
          </RadioButton.Group>

          {/* Continue Button */}
          <Button
            mode="contained"
            onPress={handleContinue}
            disabled={isLoading}
            loading={isLoading}
            style={styles.continueButton}
            contentStyle={styles.continueButtonContent}
            icon="arrow-right"
          >
            Continue with {selectedProviderData?.label ?? 'SSO'}
          </Button>

          {/* Help Text */}
          <View style={styles.helpContainer}>
            <Icon
              name="help-circle-outline"
              size={16}
              color={theme.colors.outline}
            />
            <Text
              variant="bodySmall"
              style={[styles.helpText, { color: theme.colors.outline }]}
            >
              Contact your organization administrator if you are unsure which
              provider to select or if SSO has not been configured.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={5000}
        action={{
          label: 'OK',
          onPress: dismissSnackbar,
        }}
      >
        {errorMessage}
      </Snackbar>
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  instructionTitle: {
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  instructionBody: {
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    marginBottom: 20,
  },
  providerCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  providerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  providerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  providerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  providerTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  continueButton: {
    marginTop: 24,
    borderRadius: 8,
  },
  continueButtonContent: {
    paddingVertical: 6,
    flexDirection: 'row-reverse',
  },
  helpContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    paddingHorizontal: 4,
  },
  helpText: {
    flex: 1,
    marginLeft: 8,
    lineHeight: 18,
  },
  webViewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  webViewText: {
    marginTop: 24,
    textAlign: 'center',
  },
  webViewHint: {
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelButton: {
    marginTop: 32,
  },
});

export default SSOLoginScreen;
