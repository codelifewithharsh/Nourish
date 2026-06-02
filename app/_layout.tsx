import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { CreditsProvider } from '@/features/credits/CreditsContext';
import { WATER_ACTION_ID } from '@/lib/notifications';

async function handleLogWaterFromNotification() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('water_logs')
    .select('glasses')
    .eq('user_id', session.user.id)
    .eq('date', today)
    .maybeSingle();

  const current = data?.glasses ?? 0;
  await supabase.from('water_logs').upsert(
    { user_id: session.user.id, date: today, glasses: current + 1 },
    { onConflict: 'user_id,date' },
  );
}

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

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === WATER_ACTION_ID) {
        handleLogWaterFromNotification();
      }
    });

    return () => {
      subscription.unsubscribe();
      responseListener.remove();
    };
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
