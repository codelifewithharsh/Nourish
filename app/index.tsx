import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Txt } from '@/components/ui';

export default function Root() {

  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.6)).current;
  const logoPulse    = useRef(new Animated.Value(1)).current;
  const glowScale    = useRef(new Animated.Value(0.6)).current;
  const tagOpacity   = useRef(new Animated.Value(0)).current;
  const tagY         = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Entrance: logo + glow spring in together
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale,   { toValue: 1, tension: 45, friction: 7, useNativeDriver: true }),
        Animated.spring(glowScale,   { toValue: 1, tension: 40, friction: 8, useNativeDriver: true }),
      ]),
      // Tagline slides up
      Animated.parallel([
        Animated.timing(tagOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(tagY,       { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Continuous gentle pulse on logo after entrance
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.06, duration: 1600, useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 1,    duration: 1600, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/(auth)/login');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle();
      router.replace(data?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding');
    };
    run().catch(() => router.replace('/(auth)/login'));
  }, []);

  return (
    <View style={s.root}>
      {/* Glow circle */}
      <Animated.View style={[s.glow, { opacity: logoOpacity, transform: [{ scale: glowScale }] }]} />

      {/* Logo */}
      <Animated.View style={[s.logoWrap, { opacity: logoOpacity, transform: [{ scale: Animated.multiply(logoScale, logoPulse) }] }]}>
        <Image
          source={require('@/assets/pulseai-white.png')}
          style={s.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name */}
      <Animated.View style={[s.nameWrap, { opacity: logoOpacity }]}>
        <Txt style={s.appName}>PulseAI</Txt>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: tagOpacity, transform: [{ translateY: tagY }] }}>
        <Txt style={s.tagline}>Your Personal AI Nutritionist</Txt>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A3A2A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },

  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(76,175,130,0.18)',
  },

  logoWrap: {
    shadowColor: '#7FFFD4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 36,
  },

  logo: {
    width: 220,
    height: 220,
  },

  nameWrap: {
    alignItems: 'center',
    marginTop: -8,
  },

  appName: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 58,
  },

  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.2,
    lineHeight: 26,
  },
});
