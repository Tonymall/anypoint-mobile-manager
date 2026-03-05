// ============================================================
// Custom Splash Screen — Shows MuleOps branding on launch
// Fades out once the app is ready to display content.
// Fully responsive: phones, tablets, landscape/portrait.
// ============================================================

import React, { useEffect } from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { width, height } = useWindowDimensions();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Hold the splash for 1.5 seconds then fade out
    opacity.value = withDelay(
      1500,
      withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      }),
    );
    scale.value = withDelay(
      1500,
      withTiming(1.02, { duration: 600, easing: Easing.out(Easing.ease) }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Image
        source={require('../../../assets/splash.png')}
        style={{ width, height }}
        resizeMode="cover"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1628',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
});

export default SplashScreen;
