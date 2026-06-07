import { useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import { Colors } from '@/constants/colors';

export default function TabsLayout() {
  const pathname = usePathname();
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // From any non-home tab, back goes to the home tab first.
      // Pathname for the index tab is just "/".
      const onHome = pathname === '/' || pathname === '';
      if (!onHome) {
        router.replace('/(tabs)');
        return true;
      }
      // On home: require a second press within 2s to exit (Android pattern).
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      return true;
    });
    return () => sub.remove();
  }, [pathname]);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="meals" />
      <Tabs.Screen name="log" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
