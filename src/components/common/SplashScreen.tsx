import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SplashScreenProps {
  onFinish: () => void;
}

function computeLayout(width: number, height: number) {
  const isLandscape = width > height;
  const minDim = Math.min(width, height);
  let device: 'phone' | 'tablet' | 'desktop' = 'phone';

  if (minDim >= 600) device = 'tablet';
  if (minDim >= 1024) device = 'desktop';

  let logoSize: number;
  let titleSize: number;
  let subtitleSize: number;
  let gap: number;

  if (device === 'phone') {
    if (isLandscape) {
      logoSize = Math.min(height * 0.38, 170);
      titleSize = Math.min(height * 0.085, 34);
      subtitleSize = Math.min(height * 0.04, 15);
      gap = Math.min(height * 0.03, 14);
    } else {
      logoSize = Math.min(width * 0.5, 220);
      titleSize = Math.min(width * 0.1, 40);
      subtitleSize = Math.min(width * 0.04, 17);
      gap = Math.min(width * 0.045, 18);
    }
  } else if (device === 'tablet') {
    if (isLandscape) {
      logoSize = Math.min(height * 0.36, 300);
      titleSize = Math.min(height * 0.07, 50);
      subtitleSize = Math.min(height * 0.032, 21);
      gap = Math.min(height * 0.035, 24);
    } else {
      logoSize = Math.min(width * 0.38, 320);
      titleSize = Math.min(width * 0.075, 54);
      subtitleSize = Math.min(width * 0.032, 22);
      gap = Math.min(width * 0.035, 26);
    }
  } else {
    logoSize = Math.min(minDim * 0.32, 360);
    titleSize = Math.min(minDim * 0.06, 60);
    subtitleSize = Math.min(minDim * 0.025, 24);
    gap = 28;
  }

  return {
    isLandscape,
    device,
    logoSize: Math.round(logoSize),
    titleSize: Math.round(titleSize),
    subtitleSize: Math.round(subtitleSize),
    gap: Math.round(gap),
  };
}

function MoLogo({ size }: { size: number }) {
  const inset = size * 0.1;
  const mLeft = size * 0.385;
  const mTop = size * 0.595;
  const mPeakX = size * 0.5;
  const mRight = size * 0.615;
  const mPeakY = size * 0.41;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <SvgLinearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#0b1830" />
          <Stop offset="55%" stopColor="#09172b" />
          <Stop offset="100%" stopColor="#040b15" />
        </SvgLinearGradient>
        <SvgLinearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#c8ecff" />
          <Stop offset="45%" stopColor="#65c4ff" />
          <Stop offset="100%" stopColor="#2186d3" />
        </SvgLinearGradient>
        <RadialGradient id="ambientGrad" cx="50%" cy="48%" rx="55%" ry="55%">
          <Stop offset="0%" stopColor="#1f9fff" stopOpacity="0.36" />
          <Stop offset="60%" stopColor="#0f5eb5" stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#0f5eb5" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="ringFill" cx="50%" cy="38%" rx="60%" ry="60%">
          <Stop offset="0%" stopColor="#54c4ff" />
          <Stop offset="30%" stopColor="#2d92ea" />
          <Stop offset="72%" stopColor="#164e9c" />
          <Stop offset="100%" stopColor="#0c2c63" />
        </RadialGradient>
        <SvgLinearGradient id="ringStroke" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#74d8ff" />
          <Stop offset="45%" stopColor="#3da7f2" />
          <Stop offset="100%" stopColor="#1568c5" />
        </SvgLinearGradient>
        <SvgLinearGradient id="mGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#cff5ff" />
          <Stop offset="35%" stopColor="#84d8ff" />
          <Stop offset="100%" stopColor="#3498ef" />
        </SvgLinearGradient>
        <ClipPath id="roundedSquare">
          <Rect x="0" y="0" width="1024" height="1024" rx="210" ry="210" />
        </ClipPath>
      </Defs>

      <G clipPath="url(#roundedSquare)">
        <Rect width="1024" height="1024" fill="url(#bgGrad)" />
        <Rect width="1024" height="1024" fill="rgba(9, 25, 46, 0.65)" />
        <Circle cx="512" cy="512" r="410" fill="url(#ambientGrad)" />
        <Circle cx="512" cy="512" r="285" fill="#031020" opacity="0.92" />
        <Circle cx="512" cy="512" r="236" fill="url(#ringFill)" />
        <Circle cx="512" cy="512" r="236" fill="none" stroke="url(#ringStroke)" strokeWidth="12" />
        <Circle cx="512" cy="512" r="198" fill="none" stroke="#69ccff" strokeOpacity="0.18" strokeWidth="4" />
        <Ellipse cx="512" cy="405" rx="180" ry="132" fill="#ffffff" opacity="0.08" />
        <Path
          d={`
            M ${mLeft} ${mTop}
            L ${mLeft} ${mTop - size * 0.2}
            L ${mPeakX} ${mPeakY + size * 0.1}
            L ${mRight} ${mTop - size * 0.2}
            L ${mRight} ${mTop}
          `}
          fill="none"
          stroke="url(#mGrad)"
          strokeWidth={size * 0.036}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={`
            M ${mLeft} ${mTop}
            L ${mLeft} ${mTop - size * 0.2}
            L ${mPeakX} ${mPeakY + size * 0.1}
            L ${mRight} ${mTop - size * 0.2}
            L ${mRight} ${mTop}
          `}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.16"
          strokeWidth={size * 0.012}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Rect
          x={inset}
          y={inset}
          width={1024 - inset * 2}
          height={1024 - inset * 2}
          rx="180"
          ry="180"
          fill="none"
          stroke="#1a3e73"
          strokeWidth="6"
          opacity="0.4"
        />
      </G>
    </Svg>
  );
}

function GradientTitle({
  size,
  width,
}: {
  size: number;
  width: number;
}) {
  const svgHeight = size * 1.25;
  return (
    <Svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}>
      <Defs>
        <SvgLinearGradient id="muleOpsTitleGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#d2f5ff" />
          <Stop offset="42%" stopColor="#71cfff" />
          <Stop offset="100%" stopColor="#1d82d2" />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        x={width / 2}
        y={svgHeight * 0.82}
        fontSize={size}
        fontWeight="800"
        letterSpacing={size * 0.15}
        textAnchor="middle"
        fill="url(#muleOpsTitleGrad)"
      >
        MuleOps
      </SvgText>
    </Svg>
  );
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => computeLayout(width, height), [width, height]);

  const overlayOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(14);
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const dividerScale = useSharedValue(0);
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.65);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) });
    contentTranslateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.ease) });
    titleOpacity.value = withDelay(220, withTiming(1, { duration: 650 }));
    dividerScale.value = withDelay(340, withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) }));
    subtitleOpacity.value = withDelay(470, withTiming(1, { duration: 650 }));

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    overlayOpacity.value = withDelay(
      1800,
      withTiming(0, { duration: 550, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      }),
    );
  }, [
    contentOpacity,
    contentTranslateY,
    dividerScale,
    glowOpacity,
    glowScale,
    onFinish,
    overlayOpacity,
    subtitleOpacity,
    titleOpacity,
  ]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: dividerScale.value,
    transform: [{ scaleX: dividerScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const titleWidth = Math.max(layout.logoSize * 1.8, 220);

  return (
    <Animated.View style={[styles.container, overlayStyle]}>
      <LinearGradient
        colors={['#0e2240', '#091428', '#050c18']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          styles.ambientGlow,
          {
            width: layout.logoSize * 2.45,
            height: layout.logoSize * 2.45,
          },
          glowStyle,
        ]}
      />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.logoWrap}>
          <MoLogo size={layout.logoSize} />
        </View>

        <View style={{ height: layout.gap * 1.15 }} />

        <Animated.View style={titleStyle}>
          <GradientTitle size={layout.titleSize} width={titleWidth} />
        </Animated.View>

        <View style={{ height: layout.gap * 0.45 }} />

        <Animated.View
          style={[
            styles.divider,
            dividerStyle,
            { width: layout.logoSize * 0.7 },
          ]}
        />

        <View style={{ height: layout.gap * 0.55 }} />

        <Animated.View style={subtitleStyle}>
          <Text
            style={[
              styles.subtitle,
              {
                fontSize: layout.subtitleSize,
                letterSpacing: layout.subtitleSize * 0.22,
              },
            ]}
          >
            Mobile Operations Control
          </Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#091428',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    overflow: 'hidden',
  },
  ambientGlow: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: '#1c88df',
    shadowColor: '#36a8ff',
    shadowOpacity: 0.35,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrap: {
    shadowColor: '#103d71',
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(95, 192, 255, 0.35)',
  },
  subtitle: {
    color: 'rgba(151, 211, 250, 0.72)',
    fontWeight: '300',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});

export default SplashScreen;
