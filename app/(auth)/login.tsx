import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { identifyUser, analytics } from '@/lib/analytics';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_SVG = `<svg width="20" height="20" viewBox="0 0 48 48">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

const FEATURES = [
  {
    emoji: '🍽️',
    title: 'Meals planned for your body',
    body: 'Indian recipes matched to your goal, cuisine & diet',
  },
  {
    emoji: '🎯',
    title: 'Targets that actually fit you',
    body: 'Calories & protein calculated from your exact stats',
  },
  {
    emoji: '🧠',
    title: 'AI coach that learns your taste',
    body: 'Swap meals, get nudges, track progress — all in one',
  },
];

function FadeUp({
  delay,
  children,
  style,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = useState(false);
  const sheetY = useRef(new Animated.Value(120)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(sheetY,       { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(sheetOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]).start();
    }, 900);
    return () => clearTimeout(t);
  }, []);

  const handleGoogleSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'nourish' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });

      if (error || !data?.url) return;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const accessToken = url.searchParams.get('access_token') ??
          new URLSearchParams(url.hash.slice(1)).get('access_token');
        const refreshToken = url.searchParams.get('refresh_token') ??
          new URLSearchParams(url.hash.slice(1)).get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            identifyUser(user.id, { email: user.email });
            analytics.login();
            const { data } = await supabase
              .from('profiles')
              .select('onboarding_completed')
              .eq('id', user.id)
              .maybeSingle();
            router.replace(data?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding');
          }
        }
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={s.root}>
      {/* ── Dark green top section ── */}
      <View style={[s.top, { paddingTop: insets.top + 24 }]}>
        <FadeUp delay={0} style={s.lottieWrapper}>
          <View style={s.glowBlob} />
          <Image
            source={require('@/assets/app_logo/nourish_logo_white.png')}
            style={s.lottie}
            resizeMode="contain"
          />
        </FadeUp>

        <FadeUp delay={200} style={s.headingBlock}>
          <Txt style={s.appName}>Nourish</Txt>
          <Txt style={s.heading}>Eat well. Live better.</Txt>
          <Txt style={s.subheading}>Your Personal AI Nutritionist</Txt>
        </FadeUp>

        {/* Feature cards */}
        <View style={s.cards}>
          {FEATURES.map((f, i) => (
            <FadeUp key={f.title} delay={450 + i * 150} style={s.card}>
              <Txt style={s.cardEmoji}>{f.emoji}</Txt>
              <View style={s.cardText}>
                <Txt style={s.cardTitle}>{f.title}</Txt>
                <Txt style={s.cardBody}>{f.body}</Txt>
              </View>
            </FadeUp>
          ))}
        </View>
      </View>

      {/* ── White bottom sheet ── */}
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: insets.bottom + 16 },
          { opacity: sheetOpacity, transform: [{ translateY: sheetY }] },
        ]}
      >
        <Txt style={s.trustLine}>
          <Txt style={s.trustBold}>12,400+</Txt> people hit their goals last month
        </Txt>
        <Txt style={s.tagline}>No guesswork. No generic plans. Just yours.</Txt>

        <TouchableOpacity
          style={[s.btnGoogle, signingIn && s.btnDisabled]}
          activeOpacity={0.85}
          onPress={handleGoogleSignIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <SvgXml xml={GOOGLE_SVG} width={20} height={20} />
              <Txt style={s.btnGoogleText}>Continue with Google</Txt>
            </>
          )}
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A3A2A',
  },

  // ── Top section ──
  top: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  glowBlob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 1000,
    backgroundColor: 'rgba(76,175,130,0.12)',
  },
  lottieWrapper: {
    width: 100,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lottie: {
    width: 180,
  },
  headingBlock: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 4,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    lineHeight: 48,
    marginBottom: 4,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: 0.3,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Feature cards ──
  cards: {
    width: '100%',
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardEmoji: {
    fontSize: 24,
    lineHeight: 30,
    width: 32,
    textAlign: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
    marginBottom: 1,
  },
  cardBody: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 16,
  },

  // ── Bottom sheet ──
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 12,
  },
  trustLine: {
    fontSize: 13,
    color: Colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 2,
  },
  trustBold: {
    fontWeight: '700',
    color: Colors.primary,
  },
  tagline: {
    fontSize: 13,
    color: Colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 2,
  },
  btnGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
  },
  btnGoogleText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 22,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
