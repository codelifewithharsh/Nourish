// Breathing-logo page loader.
//
// Used in place of ActivityIndicator on full-screen loading states (home,
// profile). The logo scales 1.0 → 1.08 and dims 1.0 → 0.85 in a 1.6s cycle,
// like a calm breath. Native-driven so it's smooth even when the JS thread
// is busy fetching.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Image, ImageSourcePropType } from 'react-native';

interface Props {
  size?: number;
  /** Override the logo asset. Defaults to the dark-green Nourish mark. */
  source?: ImageSourcePropType;
}

export function BreathingLogo({ size = 88, source }: Props) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.00, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.85, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1.00, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={s.wrap}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image
          source={source ?? require('@/assets/app_logo/nourish_logo_dark_green.png')}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
