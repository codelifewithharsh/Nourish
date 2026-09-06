import '../global.css';
import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { armSplashGate, releaseSplash } from '@/lib/splashGate';
import { supabase } from '@/lib/supabase';
import { analytics, resetUser } from '@/lib/analytics';
import { ProProvider } from '@/features/pro';
import { PhotoLogProvider } from '@/features/nutrition/PhotoLogProvider';
import { WATER_ACTION_ID, registerPushToken } from '@/lib/notifications';
import { WATER_LOGGED_EVENT } from '@/lib/events';
import { ToastContainer } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { todayStr } from '@/lib/date';

// The native splash is held until splashGate releases it. This happens
// either when the first content screen reports it has data, or when a 2s
// safety cutoff fires — whichever comes first.
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync().catch(() => {});

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

  const today = todayStr();
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
    // Hold the splash until either content first-paints (via releaseSplash)
    // or this safety cutoff fires.
    armSplashGate(2000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        analytics.logout();
        resetUser();
        // Login screen has nothing to fetch — drop the splash immediately
        // so the user lands on a ready-to-tap screen.
        releaseSplash();
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
      if (event === 'INITIAL_SESSION') {
        if (session?.user) registerPushToken(session.user.id);
        // No session at app start → land on login. Same idea as SIGNED_OUT:
        // login has no fetches, so drop the splash now.
        if (!session?.user) releaseSplash();
      }
    });

    const notifReceivedListener = Notifications.addNotificationReceivedListener(() => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      if (response.actionIdentifier === WATER_ACTION_ID) {
        handleLogWaterFromNotification();
      }
    });

    return () => {
      subscription.unsubscribe();
      notifReceivedListener.remove();
      responseListener.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ProProvider>
          {/* Inside ProProvider: photo logging goes through useAI() for
              budget and rate-limit handling. */}
          <PhotoLogProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="recipe/[id]" />
            </Stack>
            <ToastContainer />
          </PhotoLogProvider>
        </ProProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
