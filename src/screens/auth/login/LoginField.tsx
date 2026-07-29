// ============================================================
// Login — Text field
// ============================================================
// A token-driven replacement for Paper's outlined TextInput. Paper
// resolves its own colours and font sizes from the MD3 theme, which
// left the login screen unable to express focus/error states in the
// design-token vocabulary. This owns the three states we care about
// — resting, focused, invalid — and nothing else.
//
// Heights are `minHeight` only: the row grows with Dynamic Type
// rather than clipping it.
// ============================================================

import React, { memo, useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface LoginFieldProps {
  label: string;
  icon: IconName;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Inline validation message. Its presence switches the field to the invalid state. */
  error?: string | null;
  disabled?: boolean;
  /** Renders the masked input plus a reveal toggle. */
  secure?: boolean;
  inputRef?: React.RefObject<RNTextInput | null>;
  autoComplete?: RNTextInputProps['autoComplete'];
  textContentType?: RNTextInputProps['textContentType'];
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  submitBehavior?: RNTextInputProps['submitBehavior'];
  onSubmitEditing?: () => void;
  /** Fired when the field loses focus — used to gate validation messaging. */
  onBlur?: () => void;
  testID?: string;
}

function LoginField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  error,
  disabled = false,
  secure = false,
  inputRef,
  autoComplete,
  textContentType,
  keyboardType = 'default',
  returnKeyType,
  submitBehavior,
  onSubmitEditing,
  onBlur,
  testID,
}: LoginFieldProps) {
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.();
  }, [onBlur]);
  const toggleReveal = useCallback(() => setRevealed((current) => !current), []);

  const invalid = Boolean(error);
  const borderColor = invalid
    ? t.color.status.danger.base
    : focused
      ? t.color.brand.base
      : t.color.border.default;

  const accentColor = invalid
    ? t.color.status.danger.base
    : focused
      ? t.color.brand.bright
      : t.color.text.tertiary;

  return (
    <View style={styles.root}>
      <Text style={[typeScale.label, styles.label, { color: t.color.text.secondary }]}>
        {label}
      </Text>

      <View
        style={[
          styles.field,
          {
            backgroundColor: invalid
              ? t.color.status.danger.surface
              : t.color.surface.sunken,
            borderColor,
            // Focus ring: a soft halo rather than a thicker border, so the
            // row never reflows between states.
            shadowColor: invalid ? t.color.status.danger.base : t.color.brand.base,
            shadowOpacity: focused || invalid ? (t.isDark ? 0.5 : 0.22) : 0,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Icon name={icon} size={20} color={accentColor} style={styles.leadingIcon} />

        <RNTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={t.color.text.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={secure && !revealed}
          autoComplete={autoComplete}
          textContentType={textContentType}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          submitBehavior={submitBehavior}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          testID={testID}
          style={[typeScale.body, styles.input, { color: t.color.text.primary }]}
        />

        {secure ? (
          <Pressable
            onPress={toggleReveal}
            disabled={disabled}
            hitSlop={spacing.sm}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ disabled }}
            style={({ pressed }) => [
              styles.trailingButton,
              {
                backgroundColor: pressed
                  ? withAlpha(t.color.text.primary, 'faint')
                  : 'transparent',
              },
            ]}
          >
            <Icon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={t.color.text.secondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon
            name="alert-circle-outline"
            size={13}
            color={t.color.status.danger.base}
          />
          <Text style={[typeScale.caption, { color: t.color.status.danger.base }]}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  label: {
    marginBottom: spacing.xs + 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 52,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  leadingIcon: {
    marginRight: spacing.sm + 2,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    // RN adds its own vertical padding on Android; keep the text centred.
    textAlignVertical: 'center',
  },
  trailingButton: {
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
  },
});

export default memo(LoginField);
