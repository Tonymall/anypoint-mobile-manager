import { useWindowDimensions } from 'react-native';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isLandscape: boolean;
  isTablet: boolean;
  isTabletLandscape: boolean;
  isPhoneLandscape: boolean;
  columns: 1 | 2 | 3;
  contentMaxWidth: number;
  horizontalPadding: number;
  cardMinWidth: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 768;
  const isTabletLandscape = isTablet && isLandscape;
  const isPhoneLandscape = !isTablet && isLandscape;

  const columns: 1 | 2 | 3 = isTabletLandscape ? 3 : (isTablet || isLandscape) ? 2 : 1;
  const contentMaxWidth = isTabletLandscape ? 1200 : isTablet ? 900 : width;
  const horizontalPadding = isTabletLandscape ? 32 : isTablet ? 24 : 16;
  const cardMinWidth = isTabletLandscape ? 320 : isTablet ? 340 : width - 32;

  return {
    width,
    height,
    isLandscape,
    isTablet,
    isTabletLandscape,
    isPhoneLandscape,
    columns,
    contentMaxWidth,
    horizontalPadding,
    cardMinWidth,
  };
}
