// ============================================================
// Login — Control plane region
// ============================================================
// Was a dropdown: two taps and a modal to change one of four
// values, sitting at the top of the card with more visual weight
// than the credentials below it. Now it is a radio row — every
// option visible, one tap, and light enough that the password
// field is unambiguously the heavier element.
// ============================================================

import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { CONTROL_PLANE_REGIONS, getRegionById } from '../../../config/regions';
import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import type { ControlPlaneRegionId } from '../../../types';
import { hapticSelection } from '../../../utils/haptics';

export interface RegionSelectorProps {
  selectedRegion: ControlPlaneRegionId;
  onSelect: (regionId: ControlPlaneRegionId) => void;
  disabled?: boolean;
}

function RegionSelector({ selectedRegion, onSelect, disabled = false }: RegionSelectorProps) {
  const t = useTokens();
  const current = getRegionById(selectedRegion);

  const handlePress = useCallback(
    (regionId: ControlPlaneRegionId) => {
      if (regionId === selectedRegion) return;
      hapticSelection();
      onSelect(regionId);
    },
    [onSelect, selectedRegion],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Icon name="earth" size={14} color={t.color.text.secondary} />
        <Text style={[typeScale.label, { color: t.color.text.secondary }]}>
          Control plane
        </Text>
        <Text style={[typeScale.caption, styles.headerNote, { color: t.color.text.secondary }]}>
          {current.notes}
        </Text>
      </View>

      <View style={styles.options} accessibilityRole="radiogroup">
        {CONTROL_PLANE_REGIONS.map((region) => {
          const isSelected = region.id === selectedRegion;
          return (
            <Pressable
              key={region.id}
              onPress={() => handlePress(region.id)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled }}
              accessibilityLabel={`${region.label} control plane, ${region.notes}`}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: isSelected
                    ? t.color.brand.surface
                    : pressed
                      ? withAlpha(t.color.text.primary, 'faint')
                      : t.color.surface.sunken,
                  borderColor: isSelected
                    ? withAlpha(t.color.brand.base, 'soft')
                    : t.color.border.subtle,
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typeScale.label,
                  {
                    color: isSelected ? t.color.text.accent : t.color.text.secondary,
                  },
                ]}
              >
                {region.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  headerNote: {
    marginLeft: 'auto',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexGrow: 1,
    flexBasis: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 38,
  },
});

export default memo(RegionSelector);
