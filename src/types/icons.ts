// ============================================================
// Icon name type
// ============================================================
// @expo/vector-icons types `name` as a strict union of the glyphs
// in the font (react-native-vector-icons accepted any string).
// Components that take an icon name as a prop use this alias so
// the check happens at the call site instead of inside the icon.
// ============================================================

import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
