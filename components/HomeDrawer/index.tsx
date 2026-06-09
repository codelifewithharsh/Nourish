import { useEffect, useRef } from 'react';
import {
  Modal, View, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Easing, Dimensions, Alert, Image,
  PanResponder, DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  User as UserIcon, Bell, BookOpen, MessageSquareHeart,
  Settings, ChevronRight, LogOut, Flame, Calendar, Sparkles,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { SCROLL_TO_SECTION_EVENT } from '@/lib/events';
import { OGAvatar } from '@/features/pro';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(SCREEN_W * 0.86, 360);

interface Props {
  visible: boolean;
  name: string;
  email: string;
  avatarUrl?: string | null;
  goalLabel?: string;
  streak: number;
  eatenCalories: number;
  targetCalories: number;
  eatenProtein: number;
  targetProtein: number;
  onClose: () => void;
  onShowHowItWorks: () => void;
  onShowNotifications: () => void;
  onShowFeedback: () => void;
}

export function HomeDrawer({
  visible, name, email, avatarUrl, goalLabel, streak,
  eatenCalories, targetCalories, eatenProtein, targetProtein,
  onClose, onShowHowItWorks, onShowNotifications, onShowFeedback,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideX  = useRef(new Animated.Value(-DRAWER_W)).current;
  const fadeBg  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeBg, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      slideX.setValue(-DRAWER_W);
      fadeBg.setValue(0);
    }
  }, [visible]);

  const close = () => {
    Animated.parallel([
      Animated.timing(slideX, { toValue: -DRAWER_W, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeBg, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) slideX.setValue(Math.max(g.dx, -DRAWER_W));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -(DRAWER_W * 0.3) || g.vx < -0.5) {
          close();
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 100, friction: 8 }).start();
        }
      },
    })
  ).current;

  const goToYou = () => {
    haptic.light();
    close();
    setTimeout(() => router.push('/(tabs)/profile'), 250);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { close(); supabase.auth.signOut(); } },
    ]);
  };

  const calPct     = Math.min((eatenCalories / targetCalories) * 100, 100);
  const proteinPct = Math.min((eatenProtein  / targetProtein)  * 100, 100);
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  return (
    <Modal visible={visible} transparent statusBarTranslucent onRequestClose={close} animationType="none">
      <View style={StyleSheet.absoluteFill}>
      <View style={d.root}>
        {/* Dim backdrop */}
        <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View style={[d.backdrop, { opacity: fadeBg }]} />
        </TouchableOpacity>

        {/* Sliding drawer */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            d.drawer,
            { width: DRAWER_W, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, transform: [{ translateX: slideX }] },
          ]}
        >
          <ScrollView contentContainerStyle={d.scroll} showsVerticalScrollIndicator={false}>

            {/* ── Identity ── */}
            <View style={d.identity}>
              <OGAvatar size={52} radius={14}>
                <View style={d.avatar}>
                  {avatarUrl
                    ? <Image source={{ uri: avatarUrl }} style={d.avatarImg} />
                    : <Txt style={d.avatarTxt}>{initials}</Txt>
                  }
                </View>
              </OGAvatar>
              <View style={d.identityInfo}>
                <Txt style={d.name} numberOfLines={1}>{name}</Txt>
                <Txt style={d.email} numberOfLines={1}>{email}</Txt>
                {goalLabel && (
                  <View style={d.goalBadge}>
                    <Txt style={d.goalBadgeTxt}>{goalLabel}</Txt>
                  </View>
                )}
              </View>
            </View>

            {/* ── Streak strip ── */}
            <View style={d.streakStrip}>
              <View style={d.streakIcon}>
                <Flame size={18} color="#E6A817" fill="#E6A817" strokeWidth={2} />
              </View>
              <View style={d.streakInfo}>
                <Txt style={d.streakNum}>
                  {streak} <Txt style={d.streakUnit}>day{streak !== 1 ? 's' : ''}</Txt>
                </Txt>
                <Txt style={d.streakHint}>
                  {streak === 0 ? 'Log something to start' : 'Keep it going today'}
                </Txt>
              </View>
            </View>

            {/* ── Today snapshot ── */}
            <View style={d.todayCard}>
              <Txt style={d.todayLabel}>Today's progress</Txt>
              <View style={d.todayRow}>
                <View style={d.todayCell}>
                  <Txt style={d.todayVal}>{eatenCalories}</Txt>
                  <Txt style={d.todayUnit}>of {targetCalories} kcal</Txt>
                  <View style={d.todayBar}>
                    <View style={[d.todayFill, { width: `${calPct}%`, backgroundColor: Colors.accent }]} />
                  </View>
                </View>
                <View style={d.todayCell}>
                  <Txt style={[d.todayVal, { color: '#5B8DB8' }]}>{eatenProtein}g</Txt>
                  <Txt style={d.todayUnit}>of {targetProtein}g protein</Txt>
                  <View style={d.todayBar}>
                    <View style={[d.todayFill, { width: `${proteinPct}%`, backgroundColor: '#5B8DB8' }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* ── Primary action ── */}
            <TouchableOpacity style={d.primaryBtn} onPress={goToYou} activeOpacity={0.88}>
              <UserIcon size={17} color="#FFFFFF" strokeWidth={2.2} />
              <Txt style={d.primaryTxt}>Manage your profile</Txt>
              <ChevronRight size={17} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            </TouchableOpacity>

            {/* ── Quick links ── */}
            <View style={d.section}>
              <Txt style={d.sectionLabel}>Quick links</Txt>

              <DrawerItem
                icon={<Calendar size={18} color={Colors.accent} strokeWidth={2.2} />}
                label="My meal plan"
                hint="Today's plan & 7-day view"
                onPress={() => { haptic.light(); close(); setTimeout(() => router.push('/(tabs)/meals'), 250); }}
              />
              <DrawerItem
                icon={<Sparkles size={18} color={Colors.accent} strokeWidth={2.2} />}
                label="Log what I ate"
                hint="AI nutrition lookup"
                onPress={() => { haptic.light(); close(); setTimeout(() => router.push('/(tabs)/log'), 250); }}
              />
              <DrawerItem
                icon={<Bell size={18} color={Colors.accent} strokeWidth={2.2} />}
                label="Notifications"
                hint="Meal & water reminders"
                onPress={() => { haptic.light(); close(); setTimeout(onShowNotifications, 280); }}
              />
              <DrawerItem
                icon={<Settings size={18} color={Colors.accent} strokeWidth={2.2} />}
                label="Preferences"
                hint="Diet, cuisines, restrictions"
                onPress={() => {
                  haptic.light();
                  close();
                  setTimeout(() => {
                    router.push('/(tabs)/profile');
                    setTimeout(() => DeviceEventEmitter.emit(SCROLL_TO_SECTION_EVENT, 'preferences'), 400);
                  }, 250);
                }}
              />
            </View>

            {/* ── Support ── */}
            <View style={d.section}>
              <Txt style={d.sectionLabel}>Support</Txt>
              <DrawerItem
                icon={<MessageSquareHeart size={18} color={Colors.secondary} strokeWidth={2.2} />}
                label="Send feedback"
                hint="Help us improve Nourish"
                onPress={() => { haptic.light(); close(); setTimeout(onShowFeedback, 280); }}
              />
              <DrawerItem
                icon={<BookOpen size={18} color={Colors.secondary} strokeWidth={2.2} />}
                label="How Nourish works"
                hint="The plan behind your plan"
                onPress={() => { haptic.light(); close(); setTimeout(onShowHowItWorks, 280); }}
              />
            </View>

            {/* ── Tiny sign out — properly de-emphasized ── */}
            <TouchableOpacity style={d.signOut} onPress={handleSignOut} activeOpacity={0.7}>
              <LogOut size={13} color={Colors.secondary} strokeWidth={2} />
              <Txt style={d.signOutTxt}>Sign out</Txt>
            </TouchableOpacity>

            <Txt style={d.version}>Nourish v1.0</Txt>

          </ScrollView>
        </Animated.View>
      </View>
      </View>
    </Modal>
  );
}

// ─── Drawer item row ───────────────────────────────────────────────────────

function DrawerItem({
  icon, label, hint, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={di.wrap} onPress={onPress} activeOpacity={0.7}>
      <View style={di.iconWrap}>{icon}</View>
      <View style={di.info}>
        <Txt style={di.label}>{label}</Txt>
        {hint && <Txt style={di.hint}>{hint}</Txt>}
      </View>
      <ChevronRight size={16} color={Colors.secondary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const di = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  info:     { flex: 1, gap: 1 },
  label:    { fontSize: 14, fontWeight: '600', color: Colors.primary, lineHeight: 19 },
  hint:     { fontSize: 11, color: Colors.secondary, lineHeight: 15 },
});

const d = StyleSheet.create({
  root:     { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer:   { backgroundColor: Colors.surface, borderTopRightRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  scroll:   { paddingHorizontal: 18, gap: 14 },

  identity:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  avatar:       { width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:    { width: 52, height: 52, borderRadius: 14 },
  avatarTxt:    { fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 22 },
  identityInfo: { flex: 1, gap: 3 },
  name:         { fontSize: 17, fontWeight: '800', color: Colors.primary, lineHeight: 22, letterSpacing: -0.2 },
  email:        { fontSize: 12, color: Colors.secondary, lineHeight: 16 },
  goalBadge:    { alignSelf: 'flex-start', backgroundColor: Colors.accentLight, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, marginTop: 2 },
  goalBadgeTxt: { fontSize: 11, fontWeight: '700', color: Colors.accent, letterSpacing: 0.3 },

  streakStrip:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E8', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  streakIcon:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFEDC2', alignItems: 'center', justifyContent: 'center' },
  streakInfo:   { flex: 1, gap: 1 },
  streakNum:    { fontSize: 17, fontWeight: '800', color: Colors.primary, lineHeight: 22 },
  streakUnit:   { fontSize: 13, fontWeight: '700', color: Colors.secondary },
  streakHint:   { fontSize: 11, color: Colors.secondary, lineHeight: 14 },

  todayCard:    { backgroundColor: Colors.background, borderRadius: 14, padding: 14, gap: 10 },
  todayLabel:   { fontSize: 11, fontWeight: '800', color: Colors.secondary, letterSpacing: 0.6, textTransform: 'uppercase' },
  todayRow:     { flexDirection: 'row', gap: 14 },
  todayCell:    { flex: 1, gap: 4 },
  todayVal:     { fontSize: 18, fontWeight: '800', color: Colors.accent, lineHeight: 22, letterSpacing: -0.3 },
  todayUnit:    { fontSize: 10, color: Colors.secondary, lineHeight: 13 },
  todayBar:     { height: 4, backgroundColor: Colors.border, borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  todayFill:    { height: 4, borderRadius: 999 },

  primaryBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14 },
  primaryTxt:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19 },

  section:      { gap: 4, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: Colors.secondary, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 2 },

  signOut:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 12 },
  signOutTxt:   { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 16 },

  version:      { textAlign: 'center', fontSize: 10, color: Colors.secondary, marginTop: 2 },
});
