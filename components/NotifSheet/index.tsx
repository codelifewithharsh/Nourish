import { useCallback, useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Modal, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, Droplets } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui/Typography';
import {
  scheduleWaterReminders, cancelWaterReminders,
  requestNotificationPermission, type MealTimes,
} from '@/lib/notifications';
import { analytics } from '@/lib/analytics';

// ─── Notification Sheet ───────────────────────────────────────────────────────


const WATER_INTERVALS = [
  { label: 'Every 1h',  value: 1 },
  { label: 'Every 2h',  value: 2 },
  { label: 'Every 3h',  value: 3 },
  { label: 'Off',       value: 0 },
];

const BREAKFAST_OPTS = [{ label: '7 AM', hour: 7 }, { label: '8 AM', hour: 8 }, { label: '9 AM', hour: 9 }];
const LUNCH_OPTS     = [{ label: '12 PM', hour: 12 }, { label: '1 PM', hour: 13 }, { label: '2 PM', hour: 14 }];
const DINNER_OPTS    = [{ label: '6 PM', hour: 18 }, { label: '7 PM', hour: 19 }, { label: '8 PM', hour: 20 }, { label: '9 PM', hour: 21 }];

export function NotifSheet({ visible, enabled, mealTimes, onToggle, onMealTimeChange, onClose }: {
  visible: boolean;
  enabled: boolean;
  mealTimes: MealTimes;
  onToggle: (val: boolean) => void | Promise<void>;
  onMealTimeChange: (meal: keyof MealTimes, hour: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [waterInterval, setWaterInterval] = useState(0);
  const [modalMounted, setModalMounted] = useState(false);

  // Load persisted water interval on mount
  useEffect(() => {
    AsyncStorage.getItem('@nourish/water_interval').then((val) => {
      if (val !== null) setWaterInterval(Number(val));
    });
  }, []);

  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const closeSheet = useCallback(() => {
    setModalMounted(false);
    onClose();
  }, [onClose]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(600, { duration: 200 });
    backdropOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(closeSheet)();
    });
  }, [closeSheet]);

  useEffect(() => {
    if (visible) {
      setModalMounted(true);
      translateY.value = 600;
      backdropOpacity.value = 0;
      translateY.value = withSpring(0, { damping: 22, stiffness: 280, mass: 0.8 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [visible]);

  const handleWaterInterval = async (val: number) => {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    setWaterInterval(val);
    await AsyncStorage.setItem('@nourish/water_interval', String(val));
    analytics.waterIntervalChanged({ interval_hours: val });
    analytics.notificationsToggled({ type: 'water', enabled: val > 0 });
    if (val === 0) await cancelWaterReminders();
    else await scheduleWaterReminders(val);
  };

  const handleMealTime = async (meal: keyof MealTimes, hour: number) => {
    analytics.notificationTimeChanged({ meal, hour });
    await onMealTimeChange(meal, hour);
  };

  const fmtHour = (h: number) => h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  return (
    <Modal visible={modalMounted || visible} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Reanimated.View style={[StyleSheet.absoluteFill, ns.backdropColor, backdropStyle]} />
        <View style={ns.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <Reanimated.View style={[ns.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
          <ScrollView
            contentContainerStyle={{ gap: 18, paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={ns.handle} />

            {/* ── Meal reminders ── */}
            <View style={ns.section}>
              <View style={ns.sectionHeader}>
                <View style={ns.iconWrap}>
                  <Bell size={16} color={Colors.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={ns.title}>Meal Reminders</Txt>
                  <Txt style={ns.subtitle}>Tap a time to change when we nudge you</Txt>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={onToggle}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[ns.reminderList, !enabled && ns.dimmed]}>
                {([
                  { key: 'breakfast' as const, emoji: '🌅', label: 'Breakfast', opts: BREAKFAST_OPTS },
                  { key: 'lunch'     as const, emoji: '☀️', label: 'Lunch',     opts: LUNCH_OPTS     },
                  { key: 'dinner'    as const, emoji: '🌙', label: 'Dinner',    opts: DINNER_OPTS    },
                ]).map((r) => (
                  <View key={r.key} style={ns.reminderBlock}>
                    <View style={ns.reminderRow}>
                      <Txt style={ns.reminderEmoji}>{r.emoji}</Txt>
                      <Txt style={ns.reminderMeal}>{r.label}</Txt>
                      <View style={{ flex: 1 }} />
                      <Txt style={ns.reminderTimeBadge}>{fmtHour(mealTimes[r.key].hour)}</Txt>
                      {enabled && <View style={ns.activeDot} />}
                    </View>
                    <View style={ns.timeChipRow}>
                      {r.opts.map((o) => {
                        const active = mealTimes[r.key].hour === o.hour;
                        return (
                          <TouchableOpacity
                            key={o.hour}
                            style={[ns.timeChip, active && ns.timeChipActive]}
                            onPress={() => handleMealTime(r.key, o.hour)}
                            activeOpacity={0.75}
                          >
                            <Txt style={[ns.timeChipTxt, active && ns.timeChipTxtActive]}>{o.label}</Txt>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={ns.divider} />

            {/* ── Water reminders ── */}
            <View style={ns.section}>
              <View style={ns.sectionHeader}>
                <View style={[ns.iconWrap, { backgroundColor: '#EAF4FB' }]}>
                  <Droplets size={16} color="#5B8DB8" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={ns.title}>Water Reminders</Txt>
                  <Txt style={ns.subtitle}>Gentle nudges to stay hydrated</Txt>
                </View>
              </View>
              <View style={ns.chipRow}>
                {WATER_INTERVALS.map((w) => (
                  <TouchableOpacity
                    key={w.value}
                    style={[ns.chip, waterInterval === w.value && ns.chipActive]}
                    onPress={() => handleWaterInterval(w.value)}
                    activeOpacity={0.75}
                  >
                    <Txt style={[ns.chipTxt, waterInterval === w.value && ns.chipTxtActive]}>
                      {w.label}
                    </Txt>
                  </TouchableOpacity>
                ))}
              </View>
              {waterInterval > 0 && (
                <Txt style={ns.waterHint}>
                  Reminding you every {waterInterval}h from 8 AM to 10 PM
                </Txt>
              )}
            </View>

          </ScrollView>
          </Reanimated.View>
        </View>
      </View>
    </Modal>
  );
}

const ns = StyleSheet.create({
  backdropColor: { backgroundColor: 'rgba(0,0,0,0.45)' },
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  sheet:         { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 12, maxHeight: '90%' },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 6 },
  divider:       { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  section:       { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap:      { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 15, fontWeight: '800', color: Colors.primary, lineHeight: 20 },
  subtitle:      { fontSize: 11, color: Colors.secondary, lineHeight: 15, marginTop: 1 },

  reminderList:  { gap: 8 },
  reminderBlock: { gap: 6 },
  dimmed:        { opacity: 0.4 },
  reminderRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.background },
  reminderEmoji: { fontSize: 18, lineHeight: 22 },
  reminderMeal:  { fontSize: 13, fontWeight: '600', color: Colors.primary, lineHeight: 18 },
  reminderTimeBadge:{ fontSize: 12, fontWeight: '700', color: Colors.accent, lineHeight: 16 },
  activeDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent, marginLeft: 6 },

  timeChipRow:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  timeChip:         { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  timeChipActive:   { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  timeChipTxt:      { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 16 },
  timeChipTxtActive:{ color: Colors.accent, fontWeight: '800' },

  chipRow:       { flexDirection: 'row', gap: 8 },
  chip:          { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  chipActive:    { backgroundColor: '#EAF4FB', borderColor: '#5B8DB8' },
  chipTxt:       { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 16 },
  chipTxtActive: { color: '#5B8DB8', fontWeight: '800' },
  waterHint:     { fontSize: 11, color: Colors.secondary, lineHeight: 15 },

});
