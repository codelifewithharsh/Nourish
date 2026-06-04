import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, UtensilsCrossed, PlusCircle, User } from 'lucide-react-native';
import { LucideIcon } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from './Typography';

type TabName = 'index' | 'meals' | 'log' | 'profile';

interface TabConfig {
  label: string;
  Icon: LucideIcon;
}

const TAB_CONFIG: Record<TabName, TabConfig> = {
  index: { label: 'Home', Icon: Home },
  meals: { label: 'Meals', Icon: UtensilsCrossed },
  log: { label: 'Log', Icon: PlusCircle },
  profile: { label: 'You', Icon: User },
};

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIG[route.name as TabName];
          if (!config) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
            >
              <View style={isFocused ? styles.pillFocused : styles.pillInactive}>
                <config.Icon
                  size={22}
                  color={isFocused ? '#FFFFFF' : '#8E8E93'}
                  strokeWidth={isFocused ? 2.5 : 1.8}
                />
                {isFocused && (
                  <Txt variant="labelBold" color="#FFFFFF" style={styles.label}>
                    {config.label}
                  </Txt>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

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
  container: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
    gap: 10,
  },
  pillFocused: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    gap: 8,
  },
  pillInactive: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
  },
});
