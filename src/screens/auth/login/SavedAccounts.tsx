// ============================================================
// Login — Saved accounts
// ============================================================
// Lifted out of the sign-in card into its own section: resuming a
// stored session is a different job from authenticating, and
// burying it under the SSO button made the card read as one long
// undifferentiated stack.
// ============================================================

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { Card, SectionHeader } from '../../../components/ui';
import { getRegionById } from '../../../config/regions';
import type { RememberedAccountSession } from '../../../stores/authStore';
import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';

export interface SavedAccountsProps {
  accounts: RememberedAccountSession[];
  /** Non-null while one of the accounts is being restored. */
  switchingAccountId: string | null;
  /** True while the credential form is busy — locks the whole section. */
  busy: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onOpen: (accountId: string) => void;
  onForget: (accountId: string) => void;
}

function initialFor(account: RememberedAccountSession): string {
  return (
    account.user.firstName?.[0] ??
    account.user.username?.[0] ??
    '?'
  ).toUpperCase();
}

function SavedAccounts({
  accounts,
  switchingAccountId,
  busy,
  showAll,
  onToggleShowAll,
  onOpen,
  onForget,
}: SavedAccountsProps) {
  const t = useTokens();

  if (accounts.length === 0) return null;

  const visible = showAll ? accounts : accounts.slice(0, 1);
  const hidden = accounts.length - visible.length;
  const locked = busy || Boolean(switchingAccountId);

  return (
    <View style={styles.root}>
      <SectionHeader title="Saved accounts" meta={`${accounts.length}`} />

      <Card>
        {visible.map((account, index) => {
          const isSwitching = switchingAccountId === account.accountId;
          const fullName =
            `${account.user.firstName ?? ''} ${account.user.lastName ?? ''}`.trim();
          const displayName = fullName || account.user.username;
          const metaLine =
            [
              account.currentOrganization?.name ?? account.user.organizationName,
              getRegionById(account.selectedRegion).label,
            ]
              .filter(Boolean)
              .join(' • ') ||
            account.user.email ||
            account.user.username;

          return (
            <Pressable
              key={account.accountId}
              onPress={() => onOpen(account.accountId)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={`Continue as ${displayName}. ${metaLine}`}
              accessibilityState={{ disabled: locked, busy: isSwitching }}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomWidth: index === visible.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: t.color.border.subtle,
                  backgroundColor: pressed
                    ? withAlpha(t.color.text.primary, 'faint')
                    : 'transparent',
                  opacity: locked && !isSwitching ? 0.55 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: t.color.brand.surface,
                    borderColor: withAlpha(t.color.brand.base, 'border'),
                  },
                ]}
              >
                <Text style={[typeScale.subheading, { color: t.color.text.accent }]}>
                  {initialFor(account)}
                </Text>
              </View>

              <View style={styles.rowBody}>
                <Text
                  numberOfLines={1}
                  style={[typeScale.body, styles.rowTitle, { color: t.color.text.primary }]}
                >
                  {displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[typeScale.caption, { color: t.color.text.secondary }]}
                >
                  {metaLine}
                </Text>
              </View>

              <Pressable
                onPress={() => onForget(account.accountId)}
                disabled={locked}
                hitSlop={spacing.sm}
                accessibilityRole="button"
                accessibilityLabel={`Forget ${displayName}`}
                style={({ pressed }) => [
                  styles.forget,
                  {
                    backgroundColor: pressed
                      ? withAlpha(t.color.text.primary, 'faint')
                      : 'transparent',
                  },
                ]}
              >
                <Icon name="close" size={16} color={t.color.text.secondary} />
              </Pressable>

              <Icon
                name={isSwitching ? 'loading' : 'chevron-right'}
                size={18}
                color={isSwitching ? t.color.text.accent : t.color.text.secondary}
              />
            </Pressable>
          );
        })}

        {accounts.length > 1 ? (
          <Pressable
            onPress={onToggleShowAll}
            accessibilityRole="button"
            accessibilityLabel={
              showAll
                ? 'Show fewer saved accounts'
                : `Show ${hidden} more saved account${hidden === 1 ? '' : 's'}`
            }
            style={({ pressed }) => [
              styles.more,
              {
                borderTopColor: t.color.border.subtle,
                backgroundColor: pressed
                  ? withAlpha(t.color.text.primary, 'faint')
                  : 'transparent',
              },
            ]}
          >
            <Text style={[typeScale.caption, { color: t.color.text.accent }]}>
              {showAll ? 'Show fewer' : `${hidden} more`}
            </Text>
            <Icon
              name={showAll ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={t.color.text.accent}
            />
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
  },
  forget: {
    padding: spacing.xs + 2,
    borderRadius: radii.sm,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default memo(SavedAccounts);
