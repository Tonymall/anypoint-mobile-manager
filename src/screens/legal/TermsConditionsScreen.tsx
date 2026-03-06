// ============================================================
// Terms & Conditions Screen — Dual-mode
//
// mode="requiredAcceptance" → mandatory gate after env selection
// mode="readOnly"           → informational view from Settings
// ============================================================

import React, { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  BackHandler,
  Platform,
} from 'react-native';
import {
  Text,
  Button,
  Appbar,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';
import { useLegalStore } from '../../stores/legalStore';
import * as authService from '../../services/authService';
import { resetSessionFlags } from '../../services/runtimeService';
import {
  TERMS_VERSION,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
} from '../../constants/legal';
import { hapticSuccess, hapticWarning } from '../../utils/haptics';
import { anypointColors } from '../../theme';
import logger from '../../utils/logger';

interface TermsConditionsScreenProps {
  mode: 'requiredAcceptance' | 'readOnly';
}

const TermsConditionsScreen: React.FC<TermsConditionsScreenProps> = ({ mode }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const completeLogin = useAuthStore((s) => s.completeLogin);
  const logout = useAuthStore((s) => s.logout);

  const acceptTerms = useLegalStore((s) => s.acceptTerms);
  const getAcceptance = useLegalStore((s) => s.getAcceptance);

  const acceptance = user ? getAcceptance(user.id) : undefined;
  const isRequired = mode === 'requiredAcceptance';

  // Block hardware back on Android during required acceptance
  useEffect(() => {
    if (!isRequired || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Prevent back navigation — user must accept or decline
      return true;
    });

    return () => subscription.remove();
  }, [isRequired]);

  const handleAccept = useCallback(() => {
    if (!user?.id) return;

    logger.log('[Terms] User accepted terms', { version: TERMS_VERSION, userId: user.id });
    acceptTerms(user.id, TERMS_VERSION);
    hapticSuccess();
    completeLogin();
    router.replace('/(main)' as any);
  }, [user, acceptTerms, completeLogin, router]);

  const handleDecline = useCallback(async () => {
    logger.log('[Terms] User declined terms');
    hapticWarning();
    try {
      await authService.logout();
      logger.log('[Terms] authService.logout() complete (API state reset)');
      resetSessionFlags();
      logger.log('[Terms] runtimeService session flags reset');
    } finally {
      queryClient.clear();
      logger.log('[Terms] queryClient cleared');
      // Clear notifications — they belong to the current account/session.
      const { clearAll } = require('../../stores/notificationStore').useNotificationStore.getState();
      clearAll();
      logger.log('[Terms] notifications cleared');
      logout();
      logger.log('[Terms] authStore.logout() complete');
      router.replace('/(auth)/login' as any);
    }
  }, [queryClient, logout, router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const formatAcceptedDate = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      {isRequired ? (
        <View style={[styles.requiredHeader, { paddingTop: insets.top + 12 }]}>
          <View style={[styles.iconBox, { backgroundColor: anypointColors.primary + '18' }]}>
            <Icon name="file-document-check-outline" size={32} color={anypointColors.primary} />
          </View>
          <Text
            variant="headlineSmall"
            style={[styles.title, { color: theme.colors.onSurface }]}
          >
            Terms & Conditions
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
          >
            Please review and accept to continue
          </Text>
          <Text
            variant="labelSmall"
            style={[styles.versionLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            Last updated: {TERMS_LAST_UPDATED} {'\u00B7'} Version {TERMS_VERSION}
          </Text>
        </View>
      ) : (
        <>
          <Appbar.Header style={{ backgroundColor: 'transparent', elevation: 0 }}>
            <Appbar.BackAction onPress={handleBack} />
            <Appbar.Content title="Terms & Conditions" />
          </Appbar.Header>
          <View style={styles.readOnlySubheader}>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Last updated: {TERMS_LAST_UPDATED} {'\u00B7'} Version {TERMS_VERSION}
            </Text>
          </View>
        </>
      )}

      {/* Scrollable terms content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isRequired ? 100 + insets.bottom : 24 + insets.bottom },
        ]}
        showsVerticalScrollIndicator
      >
        {TERMS_SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionNumber,
                  { backgroundColor: theme.colors.primary + '14' },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.primary, fontWeight: '700' }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '600', flex: 1 }}
              >
                {section.title}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={[styles.sectionBody, { color: theme.colors.onSurfaceVariant }]}
            >
              {section.body}
            </Text>
          </View>
        ))}

        {/* Read-only acceptance status card */}
        {!isRequired && acceptance && (
          <AcceptanceStatusCard theme={theme} acceptance={acceptance} formatDate={formatAcceptedDate} />
        )}
      </ScrollView>

      {/* Bottom action bar — required mode only */}
      {isRequired && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.outlineVariant,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Button
            mode="outlined"
            onPress={handleDecline}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
            textColor={theme.colors.error}
          >
            Decline
          </Button>
          <Button
            mode="contained"
            onPress={handleAccept}
            style={[styles.actionBtn, styles.acceptBtn]}
            contentStyle={styles.actionBtnContent}
            icon="check-circle-outline"
          >
            Accept
          </Button>
        </View>
      )}
    </View>
  );
};

// ── Acceptance Status Card (read-only mode) ──
const AcceptanceStatusCard: React.FC<{
  theme: MD3Theme;
  acceptance: { version: string; acceptedAt: string };
  formatDate: (iso: string) => string;
}> = ({ theme, acceptance, formatDate }) => (
  <View
    style={[
      styles.statusCard,
      {
        backgroundColor: anypointColors.success + '10',
        borderColor: anypointColors.success + '30',
      },
    ]}
  >
    <View style={styles.statusRow}>
      <Icon name="check-circle" size={20} color={anypointColors.success} />
      <View style={styles.statusText}>
        <Text
          variant="titleSmall"
          style={{ color: theme.colors.onSurface, fontWeight: '600' }}
        >
          Terms Accepted
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Accepted on {formatDate(acceptance.acceptedAt)} {'\u00B7'} Version {acceptance.version}
        </Text>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // ── Required acceptance header ──
  requiredHeader: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  versionLabel: {
    marginTop: 8,
    opacity: 0.7,
  },
  // ── Read-only subheader ──
  readOnlySubheader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  // ── Scroll ──
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  // ── Sections ──
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBody: {
    lineHeight: 22,
    paddingLeft: 36,
  },
  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
  },
  acceptBtn: {
    flex: 2,
  },
  actionBtnContent: {
    paddingVertical: 6,
  },
  // ── Acceptance status card ──
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    flex: 1,
  },
});

export default TermsConditionsScreen;
