import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { CreditsProvider } from '@/features/credits/CreditsContext';

export default function RootLayout() {
  console.log('[layout] render');
  useEffect(() => {
    console.log('[layout] mount, subscribing to auth');
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[layout] auth event:', event, 'user:', session?.user?.email ?? 'none');
      if (event === 'SIGNED_OUT') {
        setTimeout(() => router.replace('/(auth)/login'), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <CreditsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="recipe/[id]" />
        </Stack>
      </CreditsProvider>
    </SafeAreaProvider>
  );
}
