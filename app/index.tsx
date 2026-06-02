import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { supabase } from '@/lib/supabase';
import { Txt } from '@/components/ui';
import { Colors } from '@/constants/colors';

export default function Root() {
  console.log('[index] render');
  useEffect(() => {
    console.log('[index] mount, calling getSession()');
    supabase.auth.getSession().then(async ({ data: { session } }) => {
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
    }).catch((e) => {
      console.log('[index] getSession ERROR:', e);
    });
  }, []);

  return (
    <View style={s.root}>
      <LottieView
        source={require('@/assets/lottie/plant_grow.json')}
        style={s.lottie}
        autoPlay
        loop
      />
      <Txt style={s.name}>PulseAI</Txt>
      <Txt style={s.tagline}>Your Personal Nutritionist</Txt>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#1A3A2A', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lottie:  { width: 100, height: 100 },
  name:    { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 40 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 20 },
});
