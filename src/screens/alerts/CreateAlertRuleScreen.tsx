// ============================================================
// Create Alert Rule — Form Screen
//
// Full form for creating a new alert rule with fields for
// name, type, severity, condition, recipients, and enabled
// toggle. Validates required fields before submission.
//
// Built on the design token layer: severity chips resolve to semantic
// status roles, and every surface, border and type size comes from the
// tokens, so the form is defined for both colour schemes at once.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Appbar,
  Text,
  TextInput,
  Button,
  Switch,
  HelperText,
  Chip,
  Menu,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { AlertType, AlertSeverity, AlertRecipient } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type Tokens,
} from '../../theme';
import { useCreateAlertRule } from '../../hooks/queries/useAlertQueries';
import { getSeverityRole } from '../../utils/statusHelpers';
import { hapticLight, hapticSuccess } from '../../utils/haptics';
import type { IconName } from '../../types/icons';

// --- Option Definitions ---
const ALERT_TYPES: { label: string; value: AlertType; icon: string }[] = [
  { label: 'Response Time', value: 'response-time', icon: 'timer-outline' },
  { label: 'Error Count', value: 'error-count', icon: 'alert-circle-outline' },
  { label: 'Request Count', value: 'request-count', icon: 'swap-horizontal' },
  { label: 'CPU Usage', value: 'cpu-usage', icon: 'chip' },
  { label: 'Memory Usage', value: 'memory-usage', icon: 'memory' },
  { label: 'Worker Unresponsive', value: 'worker-unresponsive', icon: 'server-off' },
  { label: 'Deployment Failed', value: 'deployment-failed', icon: 'cloud-off-outline' },
  { label: 'Custom', value: 'custom', icon: 'tune-variant' },
];

const SEVERITY_OPTIONS: { label: string; value: AlertSeverity }[] = [
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'Warning', value: 'WARNING' },
  { label: 'Info', value: 'INFO' },
];

const OPERATOR_OPTIONS: { label: string; value: string }[] = [
  { label: '> (greater than)', value: 'gt' },
  { label: '< (less than)', value: 'lt' },
  { label: '= (equal to)', value: 'eq' },
  { label: '>= (greater or equal)', value: 'gte' },
  { label: '<= (less or equal)', value: 'lte' },
];

const RECIPIENT_TYPES: { label: string; value: AlertRecipient['type']; icon: IconName }[] = [
  { label: 'Email', value: 'email', icon: 'email-outline' },
  { label: 'Push', value: 'push', icon: 'bell-outline' },
  { label: 'Slack', value: 'slack', icon: 'slack' },
];

// --- Component ---
const CreateAlertRuleScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(t), [t]);

  const createMutation = useCreateAlertRule();

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<AlertType>('response-time');
  const [severity, setSeverity] = useState<AlertSeverity>('WARNING');
  const [metric, setMetric] = useState('');
  const [operator, setOperator] = useState('gt');
  const [threshold, setThreshold] = useState('');
  const [period, setPeriod] = useState('5');
  const [consecutivePoints, setConsecutivePoints] = useState('1');
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [newRecipientType, setNewRecipientType] = useState<AlertRecipient['type']>('email');
  const [newRecipientValue, setNewRecipientValue] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Menu visibility
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);
  const [operatorMenuVisible, setOperatorMenuVisible] = useState(false);

  // Validation
  const [touched, setTouched] = useState(false);
  const nameError = touched && !name.trim();
  const thresholdError = touched && (!threshold.trim() || isNaN(Number(threshold)));

  const isValid = name.trim() && threshold.trim() && !isNaN(Number(threshold));

  const selectedTypeLabel = ALERT_TYPES.find((at) => at.value === type)?.label ?? type;
  const selectedOperatorLabel = OPERATOR_OPTIONS.find((o) => o.value === operator)?.label ?? operator;

  const handleAddRecipient = useCallback(() => {
    if (!newRecipientValue.trim()) return;
    hapticLight();
    setRecipients((prev) => [
      ...prev,
      { type: newRecipientType, value: newRecipientValue.trim() },
    ]);
    setNewRecipientValue('');
  }, [newRecipientType, newRecipientValue]);

  const handleRemoveRecipient = useCallback((index: number) => {
    hapticLight();
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    setTouched(true);
    if (!isValid) return;
    hapticLight();

    createMutation.mutate(
      {
        name: name.trim(),
        type,
        severity,
        enabled,
        condition: {
          metric: metric.trim() || type,
          operator: operator as any,
          threshold: Number(threshold),
          periodMinutes: Number(period) || 5,
          consecutivePoints: Number(consecutivePoints) || 1,
        },
        recipients,
      },
      {
        onSuccess: () => {
          hapticSuccess();
          router.back();
        },
      },
    );
  }, [
    isValid, name, type, severity, enabled, metric, operator,
    threshold, period, consecutivePoints, recipients, createMutation, router,
  ]);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <Appbar.Header style={styles.appbar} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Create Alert Rule" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Name ── */}
          <Text style={styles.sectionLabel}>RULE NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. High CPU Alert"
            mode="outlined"
            style={styles.input}
            outlineStyle={styles.inputOutline}
            error={nameError}
          />
          {nameError && (
            <HelperText type="error" visible>Name is required</HelperText>
          )}

          {/* ── Type Picker ── */}
          <Text style={styles.sectionLabel}>ALERT TYPE</Text>
          <Menu
            visible={typeMenuVisible}
            onDismiss={() => setTypeMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setTypeMenuVisible(true)}
                style={styles.pickerButton}
                contentStyle={styles.pickerButtonContent}
                icon={ALERT_TYPES.find((at) => at.value === type)?.icon}
                textColor={t.color.text.primary}
              >
                {selectedTypeLabel}
              </Button>
            }
            contentStyle={styles.menuContent}
          >
            {ALERT_TYPES.map((at) => (
              <Menu.Item
                key={at.value}
                title={at.label}
                leadingIcon={at.icon}
                onPress={() => {
                  setType(at.value);
                  setTypeMenuVisible(false);
                  hapticLight();
                }}
              />
            ))}
          </Menu>

          {/* ── Severity Picker ── */}
          <Text style={styles.sectionLabel}>SEVERITY</Text>
          <View style={styles.chipRow}>
            {SEVERITY_OPTIONS.map((s) => {
              const isActive = severity === s.value;
              const role = getSeverityRole(t, s.value);
              return (
                <Chip
                  key={s.value}
                  selected={isActive}
                  onPress={() => {
                    setSeverity(s.value);
                    hapticLight();
                  }}
                  style={[
                    styles.severityChip,
                    isActive && {
                      backgroundColor: role.surface,
                      borderColor: role.border,
                    },
                  ]}
                  selectedColor={isActive ? role.base : undefined}
                  showSelectedOverlay={false}
                  compact
                >
                  {s.label}
                </Chip>
              );
            })}
          </View>

          {/* ── Condition Section ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionCardHeader}>
              <Icon name="tune-variant" size={18} color={t.color.brand.base} />
              <Text style={styles.sectionCardTitle}>Condition</Text>
            </View>

            <Text style={styles.fieldLabel}>Metric</Text>
            <TextInput
              value={metric}
              onChangeText={setMetric}
              placeholder="e.g. cpu.usage, response.time"
              mode="outlined"
              style={styles.input}
              outlineStyle={styles.inputOutline}
            />

            <Text style={styles.fieldLabel}>Operator</Text>
            <Menu
              visible={operatorMenuVisible}
              onDismiss={() => setOperatorMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setOperatorMenuVisible(true)}
                  style={styles.pickerButton}
                  contentStyle={styles.pickerButtonContent}
                  textColor={t.color.text.primary}
                >
                  {selectedOperatorLabel}
                </Button>
              }
              contentStyle={styles.menuContent}
            >
              {OPERATOR_OPTIONS.map((o) => (
                <Menu.Item
                  key={o.value}
                  title={o.label}
                  onPress={() => {
                    setOperator(o.value);
                    setOperatorMenuVisible(false);
                    hapticLight();
                  }}
                />
              ))}
            </Menu>

            <Text style={styles.fieldLabel}>Threshold</Text>
            <TextInput
              value={threshold}
              onChangeText={setThreshold}
              placeholder="e.g. 80"
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              outlineStyle={styles.inputOutline}
              error={thresholdError}
            />
            {thresholdError && (
              <HelperText type="error" visible>Valid threshold is required</HelperText>
            )}

            <View style={styles.fieldPair}>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>Period (min)</Text>
                <TextInput
                  value={period}
                  onChangeText={setPeriod}
                  placeholder="5"
                  mode="outlined"
                  keyboardType="numeric"
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>Consecutive Points</Text>
                <TextInput
                  value={consecutivePoints}
                  onChangeText={setConsecutivePoints}
                  placeholder="1"
                  mode="outlined"
                  keyboardType="numeric"
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                />
              </View>
            </View>
          </View>

          {/* ── Recipients Section ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionCardHeader}>
              <Icon name="account-group-outline" size={18} color={t.color.brand.base} />
              <Text style={styles.sectionCardTitle}>Recipients</Text>
            </View>

            {/* Existing recipients */}
            {recipients.length > 0 && (
              <View style={styles.recipientList}>
                {recipients.map((r, idx) => (
                  <View
                    key={`${r.type}-${r.value}-${idx}`}
                    style={styles.recipientRow}
                  >
                    <Icon
                      name={RECIPIENT_TYPES.find((rt) => rt.value === r.type)?.icon ?? 'email-outline'}
                      size={16}
                      color={t.color.text.secondary}
                    />
                    <Text style={styles.recipientValue}>{r.value}</Text>
                    <Chip compact style={styles.recipientChip} textStyle={styles.recipientChipText}>
                      {r.type}
                    </Chip>
                    <Icon
                      name="close"
                      size={18}
                      color={t.color.text.secondary}
                      onPress={() => handleRemoveRecipient(idx)}
                      style={styles.recipientRemove}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Add recipient form */}
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.chipRow}>
              {RECIPIENT_TYPES.map((rt) => {
                const isActive = newRecipientType === rt.value;
                return (
                  <Chip
                    key={rt.value}
                    icon={rt.icon}
                    selected={isActive}
                    onPress={() => {
                      setNewRecipientType(rt.value);
                      hapticLight();
                    }}
                    style={[
                      styles.severityChip,
                      isActive && {
                        backgroundColor: t.color.brand.surface,
                        borderColor: withAlpha(t.color.brand.base, 'border'),
                      },
                    ]}
                    selectedColor={isActive ? t.color.text.accent : undefined}
                    showSelectedOverlay={false}
                    compact
                  >
                    {rt.label}
                  </Chip>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Value</Text>
            <View style={styles.addRecipientRow}>
              <TextInput
                value={newRecipientValue}
                onChangeText={setNewRecipientValue}
                placeholder={
                  newRecipientType === 'email'
                    ? 'user@example.com'
                    : newRecipientType === 'slack'
                    ? '#channel-name'
                    : 'Device token or user ID'
                }
                mode="outlined"
                style={[styles.input, styles.flex]}
                outlineStyle={styles.inputOutline}
              />
              <Button
                mode="contained-tonal"
                onPress={handleAddRecipient}
                style={styles.addRecipientButton}
                disabled={!newRecipientValue.trim()}
                compact
              >
                Add
              </Button>
            </View>
          </View>

          {/* ── Enabled Toggle ── */}
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={styles.toggleTitle}>Enabled</Text>
              <Text style={styles.toggleSubtitle}>
                Rule will start evaluating immediately
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => {
                setEnabled(val);
                hapticLight();
              }}
              color={t.color.brand.base}
            />
          </View>

          {/* ── Save Button ── */}
          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
            icon="check"
            buttonColor={t.color.brand.base}
            textColor={t.color.text.inverse}
          >
            Create Alert Rule
          </Button>

          {createMutation.isError && (
            <HelperText type="error" visible style={styles.errorHelper}>
              {(createMutation.error as Error).message ?? 'Failed to create rule'}
            </HelperText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// --- Styles ---
const createStyles = (t: Tokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.color.surface.canvas,
    },
    flex: {
      flex: 1,
    },
    appbar: {
      backgroundColor: t.color.surface.canvas,
    },
    appbarTitle: typeScale.heading,
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
    },
    sectionLabel: {
      ...typeScale.caption,
      color: t.color.text.tertiary,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: t.color.surface.sunken,
      ...typeScale.body,
    },
    inputOutline: {
      borderRadius: radii.md,
      borderColor: t.color.border.default,
    },
    pickerButton: {
      borderRadius: radii.md,
      borderColor: t.color.border.default,
      justifyContent: 'flex-start',
    },
    pickerButtonContent: {
      justifyContent: 'flex-start',
    },
    menuContent: {
      backgroundColor: t.color.surface.raised,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    severityChip: {
      borderRadius: radii.md,
      borderColor: t.color.border.default,
    },
    sectionCard: {
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
      backgroundColor: t.color.surface.raised,
      padding: spacing.lg,
      marginTop: spacing.xl,
    },
    sectionCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    sectionCardTitle: {
      ...typeScale.subheading,
      color: t.color.text.primary,
    },
    fieldLabel: {
      ...typeScale.label,
      color: t.color.text.secondary,
      marginTop: spacing.md,
      marginBottom: 6,
    },
    fieldPair: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    recipientList: {
      gap: 6,
      marginBottom: spacing.md,
    },
    recipientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: 10,
      borderRadius: radii.md,
      backgroundColor: t.color.surface.sunken,
    },
    recipientValue: {
      ...typeScale.bodySmall,
      color: t.color.text.primary,
      flex: 1,
    },
    recipientChip: {
      backgroundColor: t.color.surface.raised,
    },
    recipientChipText: typeScale.micro,
    recipientRemove: {
      marginLeft: spacing.xs,
    },
    addRecipientRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    addRecipientButton: {
      borderRadius: radii.md,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
      backgroundColor: t.color.surface.raised,
      marginTop: spacing.xl,
    },
    toggleTitle: {
      ...typeScale.subheading,
      color: t.color.text.primary,
    },
    toggleSubtitle: {
      ...typeScale.label,
      color: t.color.text.tertiary,
      marginTop: 2,
    },
    saveButton: {
      borderRadius: radii.lg,
      marginTop: spacing.xxl,
    },
    saveButtonContent: {
      paddingVertical: 6,
    },
    errorHelper: {
      textAlign: 'center',
    },
  });

export default CreateAlertRuleScreen;
