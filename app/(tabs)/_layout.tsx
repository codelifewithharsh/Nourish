import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import { Colors } from '@/constants/colors';

export default function TabsLayout() {
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
