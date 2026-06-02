import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Txt } from '@/components/ui';

export default function Root() {
  console.log('[index] render');

  const logoScale   = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true, delay: 100 }),
      Animated.timing(tagOpacity,  { toValue: 1, duration: 400, useNativeDriver: true, delay: 80 }),
    ]).start();
  }, []);

  useEffect(() => {
    console.log('[index] mount, calling getSession()');
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[index] session resolved:', session?.user?.email ?? 'none');
      if (!session?.user) {
        console.log('[index] no session → /(auth)/login');
        router.replace('/(auth)/login');
        return;
      }
      console.log('[index] fetching profile for', session.user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle();
      console.log('[index] profile result:', data, 'error:', error);
      const dest = data?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding';
      console.log('[index] navigating to', dest);
      router.replace(dest);
    };
    run().catch((e) => console.log('[index] ERROR:', e));
  }, []);

  return (
    <View style={s.root}>
      {/* Radial glow behind logo */}
      <Animated.View style={[s.glow, { opacity: glowOpacity }]} />

      {/* Logo */}
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
        <Image
          source={require('@/assets/pulseai-white.png')}
          style={s.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name */}
      <Animated.View style={{ opacity: textOpacity, alignItems: 'center', gap: 6 }}>
        <Txt style={s.appName}>PulseAI</Txt>
        <View style={s.dividerRow}>
          <View style={s.divider} />
          <Txt style={s.dividerTxt}>nutrition</Txt>
          <View style={s.divider} />
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: tagOpacity }}>
        <Txt style={s.tagline}>Your Personal AI Nutritionist</Txt>
      </Animated.View>

      {/* Bottom wordmark */}
      <View style={s.footer}>
        <Txt style={s.footerTxt}>Made with 🌿 in India</Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A3A2A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(76,175,130,0.15)',
    top: '50%',
    marginTop: -200,
  },

  logo: {
    width: 100,
    height: 100,
  },

  appName: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 52,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    width: 32,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
  },
  dividerTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  footer: {
    position: 'absolute',
    bottom: 48,
  },
  footerTxt: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.3,
  },
});
