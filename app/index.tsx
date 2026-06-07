import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Invisible routing shim — matches the native splash background so there is
// no flash. Navigates away as soon as the session state is known.
export default function Root() {
  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/(auth)/login'); return; }
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle();
      router.replace(data?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding');
    };
    run().catch(() => router.replace('/(auth)/login'));
  }, []);

  return <View style={s.root} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A3A2A' },
});
