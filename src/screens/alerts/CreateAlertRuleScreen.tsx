// ============================================================
// Create Alert Rule — Form Screen (2026 Design)
//
// Full form for creating a new alert rule with fields for
// name, type, severity, condition, recipients, and enabled
// toggle. Validates required fields before submission.
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
  useTheme,
  HelperText,
  Chip,
  Menu,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { AlertType, AlertSeverity, AlertRecipient } from '../../types';
import { anypointColors, severityColors } from '../../theme';
import { useCreateAlertRule } from '../../hooks/queries/useAlertQueries';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

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

const SEVERITY_OPTIONS: { label: string; value: AlertSeverity; color: string }[] = [
  { label: 'Critical', value: 'CRITICAL', color: severityColors.CRITICAL },
  { label: 'Warning', value: 'WARNING', color: severityColors.WARNING },
  { label: 'Info', value: 'INFO', color: severityColors.INFO },
];

const OPERATOR_OPTIONS: { label: string; value: string }[] = [
  { label: '> (greater than)', value: 'gt' },
  { label: '< (less than)', value: 'lt' },
  { label: '= (equal to)', value: 'eq' },
  { label: '>= (greater or equal)', value: 'gte' },
  { label: '<= (less or equal)', value: 'lte' },
];

const RECIPIENT_TYPES: { label: string; value: AlertRecipient['type']; icon: string }[] = [
  { label: 'Email', value: 'email', icon: 'email-outline' },
  { label: 'Push', value: 'push', icon: 'bell-outline' },
  { label: 'Slack', value: 'slack', icon: 'slack' },
];

// --- Component ---
const CreateAlertRuleScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

  const selectedTypeLabel = ALERT_TYPES.find((t) => t.value === type)?.label ?? type;
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
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Create Alert Rule" titleStyle={{ fontWeight: '600' }} />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Name ── */}
          <SectionLabel theme={theme}>Rule Name</SectionLabel>
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
          <SectionLabel theme={theme}>Alert Type</SectionLabel>
          <Menu
            visible={typeMenuVisible}
            onDismiss={() => setTypeMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setTypeMenuVisible(true)}
                style={styles.pickerButton}
                contentStyle={styles.pickerButtonContent}
                icon={ALERT_TYPES.find((t) => t.value === type)?.icon}
                textColor={theme.colors.onSurface}
              >
                {selectedTypeLabel}
              </Button>
            }
            contentStyle={{ backgroundColor: theme.colors.surface }}
          >
            {ALERT_TYPES.map((t) => (
              <Menu.Item
                key={t.value}
                title={t.label}
                leadingIcon={t.icon}
                onPress={() => {
                  setType(t.value);
                  setTypeMenuVisible(false);
                  hapticLight();
                }}
              />
            ))}
          </Menu>

          {/* ── Severity Picker ── */}
          <SectionLabel theme={theme}>Severity</SectionLabel>
          <View style={styles.chipRow}>
            {SEVERITY_OPTIONS.map((s) => {
              const isActive = severity === s.value;
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
                    { borderColor: theme.colors.outline },
                    isActive && {
                      backgroundColor: s.color + '18',
                      borderColor: s.color + '40',
                    },
                  ]}
                  selectedColor={isActive ? s.color : undefined}
                  showSelectedOverlay={false}
                  compact
                >
                  {s.label}
                </Chip>
              );
            })}
          </View>

          {/* ── Condition Section ── */}
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Icon name="tune-variant" size={18} color={anypointColors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.onSurface, marginLeft: 8 }}>
                Condition
              </Text>
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
                  textColor={theme.colors.onSurface}
                >
                  {selectedOperatorLabel}
                </Button>
              }
              contentStyle={{ backgroundColor: theme.colors.surface }}
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

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
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
              <View style={{ flex: 1 }}>
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
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Icon name="account-group-outline" size={18} color={anypointColors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.onSurface, marginLeft: 8 }}>
                Recipients
              </Text>
            </View>

            {/* Existing recipients */}
            {recipients.length > 0 && (
              <View style={{ gap: 6, marginBottom: 12 }}>
                {recipients.map((r, idx) => (
                  <View
                    key={`${r.type}-${r.value}-${idx}`}
                    style={[styles.recipientRow, { backgroundColor: theme.colors.surfaceVariant + '60' }]}
                  >
                    <Icon
                      name={RECIPIENT_TYPES.find((t) => t.value === r.type)?.icon ?? 'email-outline'}
                      size={16}
                      color={theme.colors.onSurfaceVariant}
                    />
                    <Text style={{ flex: 1, fontSize: 13, color: theme.colors.onSurface, marginLeft: 8 }}>
                      {r.value}
                    </Text>
                    <Chip
                      compact
                      style={{ backgroundColor: theme.colors.surfaceVariant }}
                      textStyle={{ fontSize: 10 }}
                    >
                      {r.type}
                    </Chip>
                    <Icon
                      name="close"
                      size={18}
                      color={theme.colors.onSurfaceVariant}
                      onPress={() => handleRemoveRecipient(idx)}
                      style={{ marginLeft: 4 }}
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
                      { borderColor: theme.colors.outline },
                      isActive && {
                        backgroundColor: anypointColors.primary + '15',
                        borderColor: anypointColors.primary + '30',
                      },
                    ]}
                    selectedColor={isActive ? anypointColors.primary : undefined}
                    showSelectedOverlay={false}
                    compact
                  >
                    {rt.label}
                  </Chip>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Value</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
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
                style={[styles.input, { flex: 1 }]}
                outlineStyle={styles.inputOutline}
              />
              <Button
                mode="contained-tonal"
                onPress={handleAddRecipient}
                style={{ borderRadius: 14, marginTop: 0 }}
                disabled={!newRecipientValue.trim()}
                compact
              >
                Add
              </Button>
            </View>
          </View>

          {/* ── Enabled Toggle ── */}
          <View style={[styles.toggleRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.onSurface }}>
                Enabled
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Rule will start evaluating immediately
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => {
                setEnabled(val);
                hapticLight();
              }}
              color={anypointColors.primary}
            />
          </View>

          {/* ── Save Button ── */}
          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.saveButton}
            contentStyle={{ paddingVertical: 6 }}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
            icon="check"
            buttonColor={anypointColors.primary}
          >
            Create Alert Rule
          </Button>

          {createMutation.isError && (
            <HelperText type="error" visible style={{ textAlign: 'center' }}>
              {(createMutation.error as Error).message ?? 'Failed to create rule'}
            </HelperText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ── Section label helper ──
const SectionLabel: React.FC<{ theme: MD3Theme; children: React.ReactNode }> = ({ theme, children }) => (
  <Text
    style={{
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 20,
      marginBottom: 8,
    }}
  >
    {children}
  </Text>
);

// --- Styles ---
const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    input: {
      backgroundColor: theme.colors.surfaceVariant,
      fontSize: 14,
    },
    inputOutline: {
      borderRadius: 14,
      borderColor: theme.colors.outlineVariant,
    },
    pickerButton: {
      borderRadius: 14,
      borderColor: theme.colors.outlineVariant,
      justifyContent: 'flex-start',
    },
    pickerButtonContent: {
      justifyContent: 'flex-start',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    severityChip: {
      borderRadius: 12,
    },
    sectionCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      marginTop: 20,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.onSurfaceVariant,
      marginTop: 12,
      marginBottom: 6,
    },
    recipientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: 12,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 20,
    },
    saveButton: {
      borderRadius: 16,
      marginTop: 24,
      paddingVertical: 2,
    },
  });

export default CreateAlertRuleScreen;
