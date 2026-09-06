import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, CalendarDays, Camera, User } from 'lucide-react-native';
import { LucideIcon } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { haptic } from '@/lib/haptics';

type TabName = 'index' | 'meals' | 'log' | 'profile';

/** The subset of a tab route this component touches. */
interface Route { key: string; name: string }

interface TabConfig {
  label: string;
  Icon:  LucideIcon;
}

// Three navigation tabs live inside the pill. `log` is deliberately not one
// of them — it's the detached circle to the right, because logging a meal is
// something you *do*, not a place you go.
const TAB_CONFIG: Record<Exclude<TabName, 'log'>, TabConfig> = {
  index:   { label: 'Home', Icon: Home },
  meals:   { label: 'Plan', Icon: CalendarDays },
  profile: { label: 'Me',   Icon: User },
};

const ACTION_TAB: TabName = 'log';

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const navTabs     = (state.routes as Route[]).filter((r) => r.name !== ACTION_TAB);
  const actionRoute = (state.routes as Route[]).find((r) => r.name === ACTION_TAB);

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
            const config = TAB_CONFIG[route.name as Exclude<TabName, 'log'>];
            if (!config) return null;
            const routeIndex = (state.routes as Route[]).findIndex((r) => r.key === route.key);
            // The action route lives outside the pill, so while it's open no
            // tab would be lit and the bar would read as "nowhere". Home is
            // the conceptual parent of logging, so it stays lit.
            const actionFocused = (state.routes as Route[])[state.index]?.name === ACTION_TAB;
            const isFocused = actionFocused
              ? route.name === 'index'
              : state.index === routeIndex;

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

        {/* Detached action button */}
        {actionRoute && (() => {
          const routeIndex = (state.routes as Route[]).findIndex((r) => r.key === actionRoute.key);
          const isFocused  = state.index === routeIndex;
          return (
            <TouchableOpacity
              onPress={() => { haptic.medium(); go(actionRoute.name, actionRoute.key, isFocused); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Log a meal with your camera"
              style={[styles.actionBtn, isFocused && styles.actionBtnActive]}
            >
              <Camera size={25} color="#FFFFFF" strokeWidth={2.3} />
            </TouchableOpacity>
          );
        })()}
      </View>
    </View>
  );
}

const PILL_HEIGHT = 62;
const ACTION_SIZE = 62;

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
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
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
    width: ACTION_SIZE,
    height: ACTION_SIZE,
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
});
