import { useCallback, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl,
  Alert,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Bell, Flame } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius } from '@/constants/spacing';
import { Txt } from '@/components/ui';
import { useDashboard } from '@/features/home/useDashboard';
import { IntakeCard } from '@/features/home/components/IntakeCard';
import { NutritionsCard, NUTRIENT_COLORS } from '@/features/home/components/NutritionsCard';
import { WaterBody } from '@/features/home/components/WaterBody';
import { NextMealCard } from '@/features/home/components/NextMealCard';
import { HomeDrawer } from '@/components/HomeDrawer';
import { FeedbackSheet } from '@/features/feedback/FeedbackSheet';
import { HowItWorksModal } from '@/components/HowItWorksModal';
import { OGAvatar } from '@/features/pro';
import { supabase } from '@/lib/supabase';
import { todayStr } from '@/lib/date';
import { haptic } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import { releaseSplash } from '@/lib/splashGate';

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function TodayScreen() {
  const { data, loading, refresh, userId } = useDashboard();
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [loggingMeal, setLoggingMeal] = useState(false);
  const insets = useSafeAreaInsets();
  // FloatingTabBar is absolutely positioned, so content must reserve its
  // height itself: 62px pill + 10px wrapper padding + safe area + breathing room.
  const tabBarClearance = 72 + insets.bottom + 24;

  useFocusEffect(useCallback(() => {
    analytics.screenViewed({ screen: 'home' });
    refresh();
  }, [refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    setRefreshing(false);
  }, [refresh]);

  // Logs the planned meal as eaten, with its planned macros. This is the
  // no-camera path for when someone actually ate what the plan suggested.
  const logPlannedMeal = useCallback(async () => {
    if (!userId || !data?.nextMeal) return;
    setLoggingMeal(true);
    try {
      const { error } = await supabase.from('daily_logs').insert({
        user_id:   userId,
        date:      todayStr(),
        meal_type: data.nextMeal.type,
        meal_name: data.nextMeal.name,
        calories:  data.nextMeal.calories,
        protein:   data.nextMeal.protein,
        source:    'plan',
      });
      if (error) {
        Alert.alert('Could not log', 'Please try again.');
        return;
      }
      analytics.mealLogged({
        meal_type: data.nextMeal.type,
        calories:  data.nextMeal.calories,
        protein:   data.nextMeal.protein,
      });
      refresh();
    } finally {
      setLoggingMeal(false);
    }
  }, [userId, data, refresh]);

  const logWater = useCallback(async (glasses: number) => {
    if (!userId) return;
    haptic.light();
    await supabase.from('water_logs').upsert(
      { user_id: userId, date: todayStr(), glasses },
      { onConflict: 'user_id,date' },
    );
    analytics.waterLogged({ glasses });
    refresh();
  }, [userId, refresh]);

  if (loading || !data) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.loading}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  releaseSplash();

  const { eaten, targets, insights, logged, nextMeal } = data;
  const insight = insights[0];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <View style={s.topBar}>
          <TouchableOpacity
            style={s.topLeft}
            activeOpacity={0.8}
            onPress={() => { analytics.profileDrawerOpened(); setDrawerOpen(true); }}
          >
            <OGAvatar size={44} radius={13}>
              <View style={s.avatar}>
                {data.avatarUrl
                  ? <Image source={{ uri: data.avatarUrl }} style={s.avatarImg} />
                  : <Txt style={s.avatarTxt}>{getInitials(data.userName)}</Txt>}
              </View>
            </OGAvatar>
            <View>
              <Txt style={s.greeting}>{getGreeting()}</Txt>
              <Txt style={s.name}>{data.userName.split(' ')[0]}</Txt>
            </View>
          </TouchableOpacity>

          <View style={s.topRight}>
            {data.streak > 0 && (
              <View style={s.streakPill}>
                <Flame size={14} color="#E6A817" strokeWidth={2.4} />
                <Txt style={s.streakTxt}>{data.streak}</Txt>
              </View>
            )}
            <TouchableOpacity style={s.bellBtn} activeOpacity={0.75} onPress={() => setDrawerOpen(true)}>
              <Bell size={19} color={Colors.accent} strokeWidth={1.9} />
            </TouchableOpacity>
          </View>
        </View>

        {/* The anchor: how much of today's budget is used */}
        <IntakeCard eaten={eaten.calories} target={targets.calories} />

        {/* One consequence line, only on a sustained pattern. Never a wall of
            warnings, and never a judgement on a single day. */}
        {insight && (
          <View style={[s.insight, insight.severity === 'good' && s.insightGood]}>
            <Txt style={[s.insightTxt, insight.severity === 'good' && s.insightTxtGood]}>
              {insight.message}
            </Txt>
          </View>
        )}

        {/* Macros and water share a row; water takes the right ~30% */}
        <View style={s.macroRow}>
          <NutritionsCard
            rows={[
              { label: 'Carbs',   eaten: eaten.carbs,   target: targets.carbs,   unit: 'g',  color: NUTRIENT_COLORS.carbs },
              { label: 'Fat',     eaten: eaten.fat,     target: targets.fat,     unit: 'g',  color: NUTRIENT_COLORS.fat },
              { label: 'Protein', eaten: eaten.protein, target: targets.protein, unit: 'g',  color: NUTRIENT_COLORS.protein,
                highlight: insight?.key === 'protein' && insight.severity === 'warn' },
              { label: 'Fibre',   eaten: eaten.fibre,   target: targets.fibre,   unit: 'g',  color: NUTRIENT_COLORS.fibre,
                highlight: insight?.key === 'fibre' && insight.severity === 'warn' },
            ]}
          />
          <View style={s.waterCol}>
            <WaterBody glasses={data.glasses} target={10} onChange={logWater} />
          </View>
        </View>

        {/* Next planned meal */}
        {nextMeal && (
          <NextMealCard
            meal={nextMeal}
            logging={loggingMeal}
            onLog={logPlannedMeal}
            onPress={() => router.push({
              pathname: '/recipe/[id]',
              params: {
                id: encodeURIComponent(nextMeal.name),
                type: nextMeal.type,
                calories: String(nextMeal.calories),
                protein: String(nextMeal.protein),
                carbs: '0', fat: '0',
              },
            })}
          />
        )}

        {/* Today's log, with the user's own photos */}
        {logged.length > 0 && (
          <View style={s.card}>
            <Txt style={s.sectionLabel}>Logged today</Txt>
            {logged.map((item) => (
              <View key={item.id} style={s.logRow}>
                {item.photo_url
                  ? <ExpoImage source={{ uri: item.photo_url }} style={s.logThumb} contentFit="cover" transition={150} />
                  : <View style={[s.logThumb, s.logThumbEmpty]}>
                      <Txt style={s.logThumbEmoji}>{MEAL_EMOJI[item.meal_type] ?? '🍽️'}</Txt>
                    </View>}
                <View style={s.logMain}>
                  <Txt style={s.logName} numberOfLines={1}>{item.meal_name}</Txt>
                  <Txt style={s.logMeta}>{item.calories} kcal · {Math.round(item.protein)}g protein</Txt>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      <HomeDrawer
        visible={drawerOpen}
        name={data.userName}
        email=""
        avatarUrl={data.avatarUrl}
        streak={data.streak}
        eatenCalories={eaten.calories}
        targetCalories={targets.calories}
        eatenProtein={eaten.protein}
        targetProtein={targets.protein}
        onClose={() => setDrawerOpen(false)}
        onShowHowItWorks={() => { setDrawerOpen(false); setHowItWorksOpen(true); }}
        onShowNotifications={() => setDrawerOpen(false)}
        onShowFeedback={() => { setDrawerOpen(false); setFeedbackOpen(true); }}
      />
      <HowItWorksModal visible={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
      <FeedbackSheet visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} userId={userId} userEmail="" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:  { padding: 20, gap: 14 },
  macroRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  waterCol: { width: '36%' },

  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:  { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  greeting:  { fontSize: 12, color: Colors.secondary },
  name:      { fontSize: 18, fontWeight: '700', color: Colors.primary },
  topRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakPill:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF4E0' },
  streakTxt: { fontSize: 13, fontWeight: '700', color: '#8A6100' },
  bellBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },


  insight:     { backgroundColor: '#FFF4E0', borderRadius: BorderRadius.md, padding: 14 },
  insightGood: { backgroundColor: Colors.accentLight },
  insightTxt:  { fontSize: 13, lineHeight: 19, color: '#8A6100' },
  insightTxtGood: { color: Colors.accent },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.secondary, marginBottom: 10 },



  logRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logThumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: Colors.background },
  logThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  logThumbEmoji: { fontSize: 20 },
  logMain:  { flex: 1 },
  logName:  { fontSize: 14, fontWeight: '600', color: Colors.primary },
  logMeta:  { fontSize: 12, color: Colors.secondary, marginTop: 2 },

});
