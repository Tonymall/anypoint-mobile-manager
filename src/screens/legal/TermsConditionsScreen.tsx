// ============================================================
// Terms & Conditions Screen — Dual-mode
//
// mode="requiredAcceptance" → mandatory gate after env selection
// mode="readOnly"           → informational view from Settings
//
// Drawn against the design token layer: brand/status roles carry
// the tinted surfaces, so both colour schemes resolve in one place.
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
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type Tokens,
} from '../../theme';
import logger from '../../utils/logger';

interface TermsConditionsScreenProps {
  mode: 'requiredAcceptance' | 'readOnly';
}

const TermsConditionsScreen: React.FC<TermsConditionsScreenProps> = ({ mode }) => {
  const theme = useTheme();
  const t = useTokens();
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
    <View style={[styles.root, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      {isRequired ? (
        <View style={[styles.requiredHeader, { paddingTop: insets.top + spacing.md }]}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: withAlpha(t.color.brand.base, 'soft') },
            ]}
          >
            <Icon name="file-document-check-outline" size={32} color={t.color.brand.base} />
          </View>
          <Text style={[styles.title, { color: t.color.text.primary }]}>
            Terms & Conditions
          </Text>
          <Text style={[styles.headerSubtitle, { color: t.color.text.secondary }]}>
            Please review and accept to continue
          </Text>
          <Text style={[styles.versionLabel, { color: t.color.text.tertiary }]}>
            Last updated: {TERMS_LAST_UPDATED} {'\u00B7'} Version {TERMS_VERSION}
          </Text>
        </View>
      ) : (
        <>
          <Appbar.Header style={styles.appbar}>
            <Appbar.BackAction onPress={handleBack} />
            <Appbar.Content title="Terms & Conditions" />
          </Appbar.Header>
          <View style={styles.readOnlySubheader}>
            <Text style={[styles.versionInline, { color: t.color.text.tertiary }]}>
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
          { paddingBottom: isRequired ? 100 + insets.bottom : spacing.xxl + insets.bottom },
        ]}
        showsVerticalScrollIndicator
      >
        {TERMS_SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View
                style={[styles.sectionNumber, { backgroundColor: t.color.brand.surface }]}
              >
                <Text style={[styles.sectionNumberText, { color: t.color.text.accent }]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.sectionTitle, { color: t.color.text.primary }]}>
                {section.title}
              </Text>
            </View>
            <Text style={[styles.sectionBody, { color: t.color.text.secondary }]}>
              {section.body}
            </Text>
          </View>
        ))}

        {/* Read-only acceptance status card */}
        {!isRequired && acceptance && (
          <AcceptanceStatusCard t={t} acceptance={acceptance} formatDate={formatAcceptedDate} />
        )}
      </ScrollView>

      {/* Bottom action bar — required mode only */}
      {isRequired && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: t.color.surface.raised,
              borderTopColor: t.color.border.subtle,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
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
  t: Tokens;
  acceptance: { version: string; acceptedAt: string };
  formatDate: (iso: string) => string;
}> = ({ t, acceptance, formatDate }) => (
  <View
    style={[
      styles.statusCard,
      {
        backgroundColor: withAlpha(t.color.status.success.base, 'faint'),
        borderColor: t.color.status.success.border,
      },
    ]}
  >
    <View style={styles.statusRow}>
      <Icon name="check-circle" size={20} color={t.color.status.success.base} />
      <View style={styles.statusText}>
        <Text style={[styles.statusTitle, { color: t.color.text.primary }]}>
          Terms Accepted
        </Text>
        <Text style={[styles.statusBody, { color: t.color.text.secondary }]}>
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
  appbar: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  // ── Required acceptance header ──
  requiredHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typeScale.title, fontSize: 24, lineHeight: 32, marginBottom: spacing.xs },
  headerSubtitle: { ...typeScale.body, textAlign: 'center' },
  versionLabel: { ...typeScale.caption, marginTop: spacing.sm },
  // ── Read-only subheader ──
  readOnlySubheader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  versionInline: typeScale.caption,
  // ── Scroll ──
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  // ── Sections ──
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  sectionNumber: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNumberText: { ...typeScale.caption, fontWeight: '700' },
  sectionTitle: { ...typeScale.heading, flex: 1 },
  sectionBody: {
    ...typeScale.body,
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
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
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: typeScale.subheading,
  statusBody: typeScale.bodySmall,
});

export default TermsConditionsScreen;
