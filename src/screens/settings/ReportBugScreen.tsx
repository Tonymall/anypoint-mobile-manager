// ============================================================
// Report a Bug — free-text report submitted from inside the app
//
// Built on the design token layer, so the hero card, form card and
// helper copy are defined for both colour schemes in one place.
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Appbar,
  Button,
  Dialog,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { submitBugReport } from '../../services/bugReportService';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { radii, spacing, typeScale, useTokens, type Tokens } from '../../theme';
import logger from '../../utils/logger';

const ReportBugScreen: React.FC = () => {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(t), [t]);
  const showError = useErrorDialogStore((s) => s.showError);

  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thankYouVisible, setThankYouVisible] = useState(false);
  const goToSettings = useCallback(() => {
    router.replace('/(main)/settings');
  }, [router]);

  const handleSubmit = useCallback(async () => {
    const trimmed = description.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitBugReport({
        title: 'User bug report',
        message: trimmed,
        details: `Reported from Settings > Report a Bug\n\n${trimmed}`,
      });
      setThankYouVisible(true);
      setDescription('');
    } catch (error: any) {
      logger.warn('[ReportBugScreen] Report bug failed:', error?.message);
      showError({
        title: 'Could not submit bug report',
        message:
          error?.message || 'The app could not submit the bug report right now. Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [description, isSubmitting, showError]);

  const handleContinue = useCallback(() => {
    setThankYouVisible(false);
    goToSettings();
  }, [goToSettings]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + spacing.md : 0}
    >
      <Appbar.Header
        style={styles.appbar}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={goToSettings} />
        <Appbar.Content
          title="Report a Bug"
          titleStyle={styles.headerTitle}
        />
      </Appbar.Header>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={styles.iconWrap}>
            <Icon name="bug-outline" size={28} color={t.color.status.warning.base} />
          </View>
          <Text style={styles.title}>Report a Bug</Text>
          <Text style={styles.subtitle}>
            Describe what happened and send it directly from the app.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Bug description</Text>
          <TextInput
            mode="outlined"
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder="What were you doing? What did you expect? What actually happened?"
            numberOfLines={10}
            style={styles.input}
            outlineStyle={styles.inputOutline}
            contentStyle={styles.inputContent}
            autoFocus
          />

          <Text style={styles.helper}>
            Include the screen or action that caused the issue and any visible error message.
          </Text>

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!description.trim() || isSubmitting}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            buttonColor={t.color.brand.base}
            textColor={t.color.text.inverse}
          >
            Report Bug
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={thankYouVisible} onDismiss={handleContinue} style={styles.dialog}>
          <Dialog.Title>Thank you</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogBody}>
              Thank you for reporting the bug. You can continue using the app.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button mode="contained" onPress={handleContinue}>
              Continue
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
};

const createStyles = (t: Tokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.color.surface.canvas,
    },
    appbar: {
      backgroundColor: t.color.surface.canvas,
    },
    headerTitle: typeScale.title,
    heroCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      padding: spacing.xl,
      borderRadius: radii.xl,
      backgroundColor: t.color.surface.raised,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: t.color.status.warning.surface,
    },
    title: {
      ...typeScale.title,
      color: t.color.text.primary,
      marginBottom: 6,
    },
    subtitle: {
      ...typeScale.body,
      color: t.color.text.secondary,
    },
    formCard: {
      marginHorizontal: spacing.lg,
      padding: spacing.xl,
      borderRadius: radii.xl,
      backgroundColor: t.color.surface.raised,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
    },
    label: {
      ...typeScale.subheading,
      color: t.color.text.primary,
      marginBottom: 10,
    },
    input: {
      backgroundColor: t.color.surface.sunken,
      ...typeScale.body,
    },
    inputOutline: {
      borderRadius: radii.md,
      borderColor: t.color.border.default,
    },
    inputContent: {
      minHeight: 180,
      paddingTop: spacing.md,
    },
    helper: {
      ...typeScale.bodySmall,
      fontWeight: '400',
      color: t.color.text.tertiary,
      marginTop: 10,
    },
    submitButton: {
      marginTop: 18,
      borderRadius: radii.md,
    },
    submitButtonContent: {
      height: 48,
    },
    dialog: {
      borderRadius: radii.xl,
      backgroundColor: t.color.surface.raised,
    },
    dialogBody: {
      ...typeScale.body,
      color: t.color.text.secondary,
    },
  });

export default ReportBugScreen;
