// ============================================================
// Secret Group Detail Screen — Collapsible sections for
// keystores, certificates, truststores, TLS contexts
// 2026 Modern Dark-First Design
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import {
  Appbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';
import { formatRelativeTime } from '../../utils/statusHelpers';
import {
  useSecretGroup,
  useKeystores,
  useCertificates,
  useTruststores,
  useTlsContexts,
  useDeleteSecretGroup,
} from '../../hooks/queries/useSecretManagerQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';

// ── Mask sensitive values ──
const maskValue = (value?: string): string => {
  if (!value) return '---';
  if (value.length <= 4) return '****';
  return `${value.substring(0, 4)}${'*'.repeat(Math.min(value.length - 4, 12))}`;
};

// ── Collapsible Section Component ──
const CollapsibleSection: React.FC<{
  title: string;
  icon: string;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  theme: MD3Theme;
  children: React.ReactNode;
}> = ({ title, icon, iconColor, count, expanded, onToggle, theme, children }) => (
  <View
    style={{
      marginBottom: 10,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    }}
  >
    <Pressable
      onPress={() => {
        hapticLight();
        onToggle();
      }}
      android_ripple={{ color: theme.colors.primaryContainer }}
      accessibilityLabel={`${title}, ${count} items`}
      accessibilityRole="button"
      accessibilityHint="Double tap to expand or collapse"
      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: iconColor + '14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.onSurface,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: iconColor + '14',
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: iconColor }}>
          {count}
        </Text>
      </View>
      <Icon
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={theme.colors.onSurfaceVariant}
      />
    </Pressable>

    {expanded && (
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        {children}
      </View>
    )}
  </View>
);

// ── Detail Item Row ──
const DetailRow: React.FC<{
  label: string;
  value: string;
  masked?: boolean;
  theme: MD3Theme;
}> = ({ label, value, masked, theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
    <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
      {label}
    </Text>
    <Text
      style={{
        fontSize: 12,
        color: masked ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
        fontWeight: '500',
        fontFamily: masked ? 'monospace' : undefined,
        maxWidth: '55%',
      }}
      numberOfLines={1}
    >
      {masked ? maskValue(value) : value}
    </Text>
  </View>
);

// ── Sub-item Card ──
const SubItemCard: React.FC<{
  children: React.ReactNode;
  theme: MD3Theme;
}> = ({ children, theme }) => (
  <View
    style={{
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant + '50',
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    }}
  >
    {children}
  </View>
);

// ── Main Screen ──
const SecretGroupDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: group, isLoading: groupLoading, error: groupError, refetch: refetchGroup } =
    useSecretGroup(groupId ?? '');
  const { data: keystores, isLoading: keystoresLoading } = useKeystores(groupId ?? '');
  const { data: certificates, isLoading: certsLoading } = useCertificates(groupId ?? '');
  const { data: truststores, isLoading: truststoresLoading } = useTruststores(groupId ?? '');
  const { data: tlsContexts, isLoading: tlsLoading } = useTlsContexts(groupId ?? '');
  const deleteSecretGroup = useDeleteSecretGroup();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    keystores: false,
    certificates: false,
    truststores: false,
    tlsContexts: false,
  });
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const keystoresList = useMemo(() => (keystores as any[]) ?? [], [keystores]);
  const certificatesList = useMemo(() => (certificates as any[]) ?? [], [certificates]);
  const truststoresList = useMemo(() => (truststores as any[]) ?? [], [truststores]);
  const tlsContextsList = useMemo(() => (tlsContexts as any[]) ?? [], [tlsContexts]);

  const handleDelete = useCallback(async () => {
    if (!groupId) return;
    setDeleteDialogVisible(false);
    try {
      await deleteSecretGroup.mutateAsync(groupId);
      router.back();
    } catch {
      setDeleteDialogVisible(true);
    }
  }, [groupId, deleteSecretGroup, router]);

  const isLoading = groupLoading || keystoresLoading || certsLoading || truststoresLoading || tlsLoading;

  if (isLoading) return <LoadingState message="Loading secret group..." />;
  if (groupError) return <ErrorState message={(groupError as Error).message} onRetry={() => refetchGroup()} />;

  const groupData = group as any;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={groupData?.name ?? 'Secret Group'}
          titleStyle={styles.headerTitle}
        />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Group Info Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardAccent} />
          <View style={{ padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: anypointColors.error + '14',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Icon name="lock" size={26} color={anypointColors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: theme.colors.onSurface,
                    letterSpacing: -0.3,
                  }}
                  numberOfLines={1}
                >
                  {groupData?.name ?? 'Unknown'}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Secret Group
                </Text>
              </View>
            </View>

            {/* Metadata chips */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: groupData?.downloadable
                    ? anypointColors.success + '12'
                    : theme.colors.surfaceVariant,
                }}
              >
                <Icon
                  name={groupData?.downloadable ? 'download' : 'download-off'}
                  size={13}
                  color={groupData?.downloadable ? anypointColors.success : theme.colors.onSurfaceVariant}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: groupData?.downloadable ? anypointColors.success : theme.colors.onSurfaceVariant,
                  }}
                >
                  {groupData?.downloadable ? 'Downloadable' : 'Not downloadable'}
                </Text>
              </View>

              {groupData?.createdAt && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
                    backgroundColor: theme.colors.surfaceVariant,
                  }}
                >
                  <Icon name="clock-outline" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: theme.colors.onSurfaceVariant }}>
                    {formatRelativeTime(groupData.createdAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Collapsible Sections ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          {/* Keystores */}
          <CollapsibleSection
            title="Keystores"
            icon="key-variant"
            iconColor={anypointColors.primary}
            count={keystoresList.length}
            expanded={expandedSections.keystores}
            onToggle={() => toggleSection('keystores')}
            theme={theme}
          >
            {keystoresList.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 12 }}>
                No keystores in this group
              </Text>
            ) : (
              keystoresList.map((ks: any, i: number) => (
                <SubItemCard key={ks.id ?? i} theme={theme}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface, marginBottom: 6 }}>
                    {ks.name ?? 'Unnamed'}
                  </Text>
                  <DetailRow label="Type" value={ks.type ?? '---'} theme={theme} />
                  <DetailRow label="Algorithm" value={ks.algorithm ?? '---'} theme={theme} />
                  <DetailRow label="Key" value={ks.key ?? ks.keyValue ?? ''} masked theme={theme} />
                  <DetailRow label="Expiration" value={ks.expirationDate ? formatRelativeTime(ks.expirationDate) : '---'} theme={theme} />
                </SubItemCard>
              ))
            )}
          </CollapsibleSection>

          {/* Certificates */}
          <CollapsibleSection
            title="Certificates"
            icon="certificate"
            iconColor={anypointColors.success}
            count={certificatesList.length}
            expanded={expandedSections.certificates}
            onToggle={() => toggleSection('certificates')}
            theme={theme}
          >
            {certificatesList.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 12 }}>
                No certificates in this group
              </Text>
            ) : (
              certificatesList.map((cert: any, i: number) => (
                <SubItemCard key={cert.id ?? i} theme={theme}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface, marginBottom: 6 }}>
                    {cert.name ?? 'Unnamed'}
                  </Text>
                  <DetailRow label="Issuer" value={cert.issuer ?? '---'} masked theme={theme} />
                  <DetailRow label="Subject" value={cert.subject ?? '---'} masked theme={theme} />
                  <DetailRow label="Certificate" value={cert.certificateValue ?? cert.certContent ?? ''} masked theme={theme} />
                  <DetailRow label="Expiration" value={cert.expirationDate ? formatRelativeTime(cert.expirationDate) : '---'} theme={theme} />
                </SubItemCard>
              ))
            )}
          </CollapsibleSection>

          {/* Truststores */}
          <CollapsibleSection
            title="Truststores"
            icon="shield-lock"
            iconColor={anypointColors.warning}
            count={truststoresList.length}
            expanded={expandedSections.truststores}
            onToggle={() => toggleSection('truststores')}
            theme={theme}
          >
            {truststoresList.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 12 }}>
                No truststores in this group
              </Text>
            ) : (
              truststoresList.map((ts: any, i: number) => (
                <SubItemCard key={ts.id ?? i} theme={theme}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface, marginBottom: 6 }}>
                    {ts.name ?? 'Unnamed'}
                  </Text>
                  <DetailRow label="Type" value={ts.type ?? '---'} theme={theme} />
                  <DetailRow label="Certificates" value={`${ts.certificateCount ?? ts.certificates?.length ?? 0}`} theme={theme} />
                  <DetailRow label="Store Content" value={ts.storeValue ?? ts.trustStoreContent ?? ''} masked theme={theme} />
                  <DetailRow label="Expiration" value={ts.expirationDate ? formatRelativeTime(ts.expirationDate) : '---'} theme={theme} />
                </SubItemCard>
              ))
            )}
          </CollapsibleSection>

          {/* TLS Contexts */}
          <CollapsibleSection
            title="TLS Contexts"
            icon="shield-check"
            iconColor={anypointColors.mulePurple}
            count={tlsContextsList.length}
            expanded={expandedSections.tlsContexts}
            onToggle={() => toggleSection('tlsContexts')}
            theme={theme}
          >
            {tlsContextsList.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 12 }}>
                No TLS contexts in this group
              </Text>
            ) : (
              tlsContextsList.map((tls: any, i: number) => (
                <SubItemCard key={tls.id ?? i} theme={theme}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface, marginBottom: 6 }}>
                    {tls.name ?? 'Unnamed'}
                  </Text>
                  <DetailRow label="Target" value={tls.target ?? '---'} theme={theme} />
                  <DetailRow label="Keystore" value={tls.keystore?.name ?? tls.keystorePath ?? '---'} theme={theme} />
                  <DetailRow label="Truststore" value={tls.truststore?.name ?? tls.truststorePath ?? '---'} theme={theme} />
                </SubItemCard>
              ))
            )}
          </CollapsibleSection>
        </View>

        {/* ── Delete Action ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Pressable
            onPress={() => setDeleteDialogVisible(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.error + '40',
            }}
            android_ripple={{ color: theme.colors.error + '20' }}
            accessibilityLabel="Delete secret group"
            accessibilityRole="button"
          >
            <Icon name="delete-outline" size={18} color={theme.colors.error} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.error }}>
              Delete Secret Group
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Delete Confirmation */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Secret Group"
        message={`Are you sure you want to delete "${groupData?.name ?? 'this group'}"? This action cannot be undone and will remove all associated keystores, certificates, truststores, and TLS contexts.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogVisible(false)}
        destructive
      />
    </View>
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
    infoCard: {
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },
    infoCardAccent: {
      height: 3,
      backgroundColor: anypointColors.error,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
  });

export default SecretGroupDetailScreen;
