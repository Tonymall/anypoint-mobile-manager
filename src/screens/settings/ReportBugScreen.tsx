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
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { submitBugReport } from '../../services/bugReportService';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { anypointColors } from '../../theme';
import logger from '../../utils/logger';

const ReportBugScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
    >
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
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
          paddingTop: 8,
          paddingBottom: insets.bottom + 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={styles.iconWrap}>
            <Icon name="bug-outline" size={28} color={anypointColors.warning} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            Report a Bug
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Describe what happened and send it directly from the app.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text variant="labelLarge" style={styles.label}>
            Bug description
          </Text>
          <TextInput
            mode="outlined"
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder="What were you doing? What did you expect? What actually happened?"
            numberOfLines={10}
            style={styles.input}
            contentStyle={styles.inputContent}
            autoFocus
          />

          <Text variant="bodySmall" style={styles.helper}>
            Include the screen or action that caused the issue and any visible error message.
          </Text>

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!description.trim() || isSubmitting}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
          >
            Report Bug
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={thankYouVisible} onDismiss={handleContinue} style={styles.dialog}>
          <Dialog.Title>Thank you</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
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

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    heroCard: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 16,
      padding: 20,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: anypointColors.warning + '18',
    },
    title: {
      color: theme.colors.onSurface,
      fontWeight: '700',
      marginBottom: 6,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
    },
    formCard: {
      marginHorizontal: 16,
      padding: 20,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    label: {
      color: theme.colors.onSurface,
      marginBottom: 10,
      fontWeight: '600',
    },
    input: {
      backgroundColor: theme.colors.surface,
    },
    inputContent: {
      minHeight: 180,
      paddingTop: 12,
    },
    helper: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 10,
      lineHeight: 18,
    },
    submitButton: {
      marginTop: 18,
      borderRadius: 14,
    },
    submitButtonContent: {
      height: 48,
    },
    dialog: {
      borderRadius: 24,
    },
  });

export default ReportBugScreen;
