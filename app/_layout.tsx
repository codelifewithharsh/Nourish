import '../global.css';
import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { analytics, resetUser } from '@/lib/analytics';
import { CreditsProvider } from '@/features/credits/CreditsContext';
import { WATER_ACTION_ID, registerPushToken } from '@/lib/notifications';
import { WATER_LOGGED_EVENT } from '@/lib/events';
import { ToastContainer } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

// Capture unhandled JS errors and send to PostHog
declare const ErrorUtils: {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (fn: (error: Error, isFatal?: boolean) => void) => void;
} | undefined;

if (typeof ErrorUtils !== 'undefined') {
  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    analytics.jsError({
      kind:    isFatal ? 'fatal' : 'unhandled',
      message: error?.message ?? String(error),
      stack:   error?.stack?.slice(0, 1000),
    });
    prev?.(error, isFatal);
  });
}

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
  const newCount = current + 1;
  await supabase.from('water_logs').upsert(
    { user_id: session.user.id, date: today, glasses: newCount },
    { onConflict: 'user_id,date' },
  );
  DeviceEventEmitter.emit(WATER_LOGGED_EVENT, { glasses: newCount });
}

export default function RootLayout() {
  useEffect(() => {
    // Hide the native splash immediately — index.tsx has the same dark green
    // background so the handoff is invisible. Waiting for INITIAL_SESSION
    // (SecureStore read) caused a 1-3s freeze on the static logo screen.
    SplashScreen.hideAsync();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        analytics.logout();
        resetUser();
        setTimeout(() => router.replace('/(auth)/login'), 0);
      }
      if (event === 'SIGNED_IN' && session?.user) {
        registerPushToken(session.user.id);
        const uid = session.user.id;
        supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', uid)
          .maybeSingle()
          .then(({ data }) => {
            router.replace(data?.onboarding_completed ? '/(tabs)' : '/(auth)/onboarding');
          });
      }
      if (event === 'INITIAL_SESSION' && session?.user) {
        registerPushToken(session.user.id);
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
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <CreditsProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="recipe/[id]" />
          </Stack>
          <ToastContainer />
        </CreditsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
