import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing,
} from 'react-native-reanimated';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, CalendarDays, Camera, User } from 'lucide-react-native';
import { LucideIcon } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { usePhotoLogger } from '@/features/nutrition/PhotoLogProvider';
import { useScrollState } from '@/features/nutrition/ScrollContext';

type TabName = 'index' | 'meals' | 'profile';

/** The subset of a tab route this component touches. */
interface Route { key: string; name: string }

interface TabConfig {
  label: string;
  Icon:  LucideIcon;
}

// Three navigation tabs live inside the pill. The camera is deliberately not
// one of them — it's the detached circle to the right, because logging a meal
// is something you *do*, not a place you go. It opens the camera directly
// rather than navigating anywhere.
const TAB_CONFIG: Record<TabName, TabConfig> = {
  index:   { label: 'Home', Icon: Home },
  meals:   { label: 'Plan', Icon: CalendarDays },
  profile: { label: 'Me',   Icon: User },
};

const AnimatedTouchable = Reanimated.createAnimatedComponent(TouchableOpacity);

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { start, busy } = usePhotoLogger();
  const { atTop } = useScrollState();

  // 1 = extended, 0 = collapsed.
  const expand = useSharedValue(1);
  useEffect(() => {
    expand.value = withTiming(atTop ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [atTop]);

  const animatedWidth = useAnimatedStyle(() => ({
    width: interpolate(expand.value, [0, 1], [ACTION_SIZE, ACTION_EXTENDED]),
  }));

  // Fades over the first half of the collapse so the text is gone well before
  // the button reaches circle width.
  const labelStyle = useAnimatedStyle(() => ({
    opacity:    interpolate(expand.value, [0, 0.55, 1], [0, 0, 1]),
    marginLeft: interpolate(expand.value, [0, 1], [0, 8]),
    // Collapses to zero width alongside the button. Without this the label
    // keeps its measured width while invisible and shoves the icon off the
    // centre of the circle.
    maxWidth:   interpolate(expand.value, [0, 1], [0, 120]),
  }));

  const navTabs = state.routes as Route[];

  const go = (routeName: string, key: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.row}>
        {/* Navigation pill */}
        <View style={styles.pill}>
          {navTabs.map((route: Route) => {
            const config = TAB_CONFIG[route.name as TabName];
            if (!config) return null;
            const routeIndex = (state.routes as Route[]).findIndex((r) => r.key === route.key);
            const isFocused = state.index === routeIndex;

            return (
              <TouchableOpacity
                key={route.key}
                onPress={() => { haptic.light(); go(route.name, route.key, isFocused); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={config.label}
                accessibilityState={isFocused ? { selected: true } : {}}
                style={styles.tabItem}
              >
                <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                  <config.Icon
                    size={22}
                    color={isFocused ? '#FFFFFF' : '#9A9A9A'}
                    strokeWidth={isFocused ? 2.4 : 1.9}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Detached action button — opens the camera in place, over whatever
            screen the user is on, rather than navigating to a capture tab.
            Extended at the top of a page, collapsed to a circle once the user
            scrolls, the way a compose button behaves. */}
        <AnimatedTouchable
          onPress={() => { haptic.medium(); start({ source: 'ask' }); }}
          activeOpacity={0.85}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Scan your meal"
          accessibilityState={{ disabled: busy }}
          style={[styles.actionBtn, busy && styles.actionBtnActive, animatedWidth]}
        >
          {busy
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Camera size={25} color="#FFFFFF" strokeWidth={2.3} />}

          {/* Width animates independently of opacity so the label fades out
              before the button has finished shrinking, rather than being
              clipped mid-word. */}
          <Reanimated.Text
            style={[styles.actionLabel, labelStyle]}
            numberOfLines={1}
          >
            Scan your meal
          </Reanimated.Text>
        </AnimatedTouchable>
      </View>
    </View>
  );
}

const PILL_HEIGHT = 62;
const ACTION_SIZE = 62;
// Wide enough for "Scan your meal" beside the icon. The pill shrinks to make
// room, so this can't grow much without crowding the three nav tabs.
const ACTION_EXTENDED = 186;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    paddingHorizontal: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    height: PILL_HEIGHT,
    paddingHorizontal: 10,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  tabItem: {
    paddingHorizontal: 4,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.accent,
  },
  actionBtn: {
    height: ACTION_SIZE,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: ACTION_SIZE / 2,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  actionBtnActive: {
    backgroundColor: '#245C43',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
