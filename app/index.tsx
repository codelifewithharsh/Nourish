import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Txt } from '@/components/ui';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const CREAM = '#F7F5F2';
const DURATION = 600;
const ease = Easing.out(Easing.cubic);

export default function Root() {
  const logoOpacity  = useSharedValue(0);
  const logoEnter    = useSharedValue(0.85);
  const glowOpacity  = useSharedValue(0);
  const wordOpacity  = useSharedValue(0);
  const tagOpacity   = useSharedValue(0);
  const breatheScale = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: DURATION, easing: ease });
    logoEnter.value   = withTiming(1, { duration: DURATION, easing: ease });
    glowOpacity.value = withTiming(1, { duration: DURATION, easing: ease });
    wordOpacity.value = withDelay(DURATION,       withTiming(1, { duration: 400, easing: ease }));
    tagOpacity.value  = withDelay(DURATION + 150, withTiming(1, { duration: 400, easing: ease }));

    breatheScale.value = withDelay(
      DURATION + 400,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0,  { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, false,
      ),
    );
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoEnter.value }],
  }));
  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breatheScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
  }));

  useEffect(() => {
    const run = async () => {
      // Run auth checks and the minimum display timer concurrently so the
      // animated splash always shows for at least 3.5s from mount
      // (native splash hides at 1.5s → user sees ~2s of animated splash).
      const sessionPromise = supabase.auth.getSession();
      const minDisplay = new Promise<void>(r => setTimeout(r, 2000));

      const { data: { session } } = await sessionPromise;

      let profileData: { onboarding_completed: boolean } | null = null;
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', session.user.id)
          .maybeSingle();
        profileData = data;
      }

      await minDisplay; // Ensure animated splash plays fully before navigating

      if (!session?.user) { router.replace('/(auth)/login'); return; }
      router.replace(profileData?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding');
    };
    run().catch(() => router.replace('/(auth)/login'));
  }, []);

  return (
    <View style={s.root}>
      <Reanimated.View style={[s.glow, glowStyle]} />
      <View style={s.group}>
        <Reanimated.View style={[s.logoWrap, wrapStyle]}>
          <Reanimated.Image
            source={require('@/assets/app_logo/nourish_logo_white.png')}
            style={[s.logo, breatheStyle]}
            resizeMode="contain"
          />
        </Reanimated.View>
        <Reanimated.View style={wordStyle}>
          <Txt style={s.wordmark}>Nourish</Txt>
        </Reanimated.View>
        <Reanimated.View style={tagStyle}>
          <Txt style={s.tagline}>Eat well. Live better.</Txt>
        </Reanimated.View>
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
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(76,175,130,0.18)',
    top: '50%',
    marginTop: -220,
  },
  group: {
    alignItems: 'center',
    marginTop: -40,
  },
  logoWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 150,
  },
  wordmark: {
    marginTop: 20,
    fontSize: 52,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: -1.5,
    lineHeight: 54,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(247,245,242,0.65)',
    letterSpacing: 0.1,
    lineHeight: 24,
    textAlign: 'center',
  },
});
