import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Share, StatusBar, Platform, Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  ChevronLeft, Share2, Clock, Flame, Check,
  ChefHat, Camera, Play, Lightbulb, ShoppingBasket, Soup,
  Zap, Wheat, Droplet,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { useRecipe, Ingredient, Step } from '@/features/recipe/useRecipe';
import { analytics } from '@/lib/analytics';
import { useAppConfigText } from '@/lib/appConfig';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TYPE_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

export default function RecipeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;             // URL-encoded meal name
    type?: MealType;
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
  }>();

  const mealName = decodeURIComponent(params.id ?? '');
  const mealType = (params.type ?? 'lunch') as MealType;
  const calories = Number(params.calories) || 0;
  const protein  = Number(params.protein)  || 0;
  const carbs    = Number(params.carbs)    || 0;
  const fat      = Number(params.fat)      || 0;

  const { recipe, loading, error, partitioned } = useRecipe(mealName);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);
  const shareFooter = useAppConfigText(
    'recipe_share_footer',
    'Made with Nourish 🌿\nEat well. Live better. → https://play.google.com/store/apps/details?id=in.nourish.app',
  );

  // When rate-limit error: hook leaves recipe=null, error=null.
  // ProProvider already showed the toast — just go back silently.
  useEffect(() => {
    if (!loading && !recipe && !error) {
      router.back();
    }
  }, [loading, recipe, error]);

  useEffect(() => {
    if (!loading && recipe) {
      analytics.screenViewed({ screen: 'recipe' });
    }
  }, [loading, recipe]);

  const handleLog = useCallback(async () => {
    if (logging || logged) return;
    setLogging(true);
    haptic.success();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLogging(false); return; }
    await supabase.from('daily_logs').insert({
      user_id:   user.id,
      date:      todayStr(),
      meal_type: mealType,
      meal_name: mealName,
      calories, protein, carbs, fat,
    });
    analytics.recipeLogged({ meal_name: mealName });
    setLogged(true);
    setLogging(false);
  }, [logging, logged, mealName, mealType, calories, protein, carbs, fat]);

  const handleShare = useCallback(async () => {
    if (!recipe) return;
    haptic.light();
    const macroLine = [
      calories  ? `⚡ ${calories} kcal` : null,
      protein   ? `${protein}g protein`  : null,
      carbs     ? `${carbs}g carbs`      : null,
      fat       ? `${fat}g fat`          : null,
    ].filter(Boolean).join(' · ');
    const lines = [
      `${recipe.hero_emoji ?? '🍽️'} ${recipe.name}`,
      macroLine,
      ``,
      recipe.tagline ?? '',
      ``,
      // Supabase-driven footer — \n is stored as literal "\n" in the text
      // column, so unescape before joining.
      shareFooter.replace(/\\n/g, '\n'),
    ];
    analytics.recipeShared({ meal_name: mealName });
    Share.share({ message: lines.filter(Boolean).join('\n') });
  }, [recipe, calories, protein, carbs, fat, mealName, shareFooter]);

  const openLink = (url?: string | null, platform?: 'instagram' | 'youtube') => {
    if (!url) return;
    haptic.light();
    if (platform) analytics.recipeExternalLinkTapped({ platform, meal_name: mealName });
    Linking.openURL(url).catch(() => {});
  };

  if (loading) {
    return <RecipeLoading mealName={mealName} insetTop={insets.top} />;
  }

  if (error || !recipe) {
    return (
      <SafeAreaView style={s.errorWrap} edges={['top']}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={22} color={Colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={s.errorBody}>
          <Txt style={s.errorEmoji}>😔</Txt>
          <Txt style={s.errorTitle}>Couldn't fetch this recipe</Txt>
          <Txt style={s.errorHint}>{error ?? 'Try again in a moment.'}</Txt>
        </View>
      </SafeAreaView>
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const steps       = recipe.steps ?? [];

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        bounces={true}
      >
        {/* ── Hero ── */}
        <LinearGradient
          colors={['#FFF4E1', '#FFE8D6', Colors.accentLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.hero, { paddingTop: insets.top + 12 }]}
        >
          <View style={s.topBar}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={10}>
              <ChevronLeft size={20} color={Colors.primary} strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={handleShare} hitSlop={10}>
              <Share2 size={17} color={Colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={s.emojiHalo}>
            <Txt style={s.emoji}>{recipe.hero_emoji ?? '🍽️'}</Txt>
          </View>

          <View style={s.pillRow}>
            <View style={s.pill}>
              <Txt style={s.pillEmoji}>{TYPE_EMOJI[mealType]}</Txt>
              <Txt style={s.pillTxt}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Txt>
            </View>
            <View style={s.pill}>
              <Clock size={11} color={Colors.primary} strokeWidth={2.4} />
              <Txt style={s.pillTxt}>{recipe.prep_minutes ?? 20} min</Txt>
            </View>
            <View style={s.pill}>
              <ChefHat size={11} color={Colors.primary} strokeWidth={2.4} />
              <Txt style={s.pillTxt}>{recipe.difficulty ?? 'easy'}</Txt>
            </View>
          </View>
        </LinearGradient>

        {/* ── Title + tagline ── */}
        <View style={s.titleBlock}>
          <Txt style={s.name}>{recipe.name}</Txt>
          {recipe.tagline && (
            <Txt style={s.tagline}>{recipe.tagline}</Txt>
          )}
        </View>

        {/* ── Watch it being made ── */}
        {(recipe.instagram_url || recipe.youtube_url) && (
          <View style={s.section}>
            <SectionHeader emoji="🎬" title="Watch it being made" />
            {/* {recipe.creator_handle && (
              <Txt style={s.creatorLine}>
                Recommended for you · <Txt style={s.creatorHandle}>{recipe.creator_handle}</Txt>
              </Txt>
            )} */}
            <View style={s.watchRow}>
              {recipe.instagram_url && (
                <TouchableOpacity
                  style={s.watchCard}
                  onPress={() => openLink(recipe.instagram_url, 'instagram')}
                  activeOpacity={0.85}
                >
                  <View style={[s.watchIconWrap, { backgroundColor: '#E1306C' }]}>
                    <Camera size={16} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={s.watchPlatform}>Instagram</Txt>
                    <Txt style={s.watchHint}>Quick reel</Txt>
                  </View>
                </TouchableOpacity>
              )}
              {recipe.youtube_url && (
                <TouchableOpacity
                  style={s.watchCard}
                  onPress={() => openLink(recipe.youtube_url, 'youtube')}
                  activeOpacity={0.85}
                >
                  <View style={[s.watchIconWrap, { backgroundColor: '#FF0000' }]}>
                    <Play size={15} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={s.watchPlatform}>YouTube</Txt>
                    <Txt style={s.watchHint}>Full method</Txt>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <HandDivider />

        {/* ── Macros ── */}
        <View style={s.section}>
          <SectionHeader emoji="🔥" title="What it gives you" />
          <View style={s.macroRow}>
            <View style={s.macroCellBig}>
              <Flame size={14} color={Colors.accent} strokeWidth={2.5} />
              <Txt style={s.macroBigVal}>{calories || '—'}</Txt>
              <Txt style={s.macroBigLbl}>kcal</Txt>
            </View>
            <View style={s.macroGrid}>
              <MacroChip color="#5B8DB8" value={`${protein}g`} label="protein" icon={<Zap     size={12} color="#5B8DB8" strokeWidth={2.2} />} />
              <MacroChip color="#E6A817" value={`${carbs}g`}   label="carbs"   icon={<Wheat   size={12} color="#E6A817" strokeWidth={2.2} />} />
              <MacroChip color="#9B59B6" value={`${fat}g`}     label="fat"     icon={<Droplet size={12} color="#9B59B6" strokeWidth={2.2} />} />
            </View>
          </View>
        </View>

        <HandDivider />

        {/* ── Ingredients ── */}
        <View style={s.section}>
          <SectionHeader emoji="🛒" title="What you need" />

          {partitioned && partitioned.fromKitchen.length > 0 && (
            <View style={s.ingrBlock}>
              <View style={s.ingrLabelRow}>
                <Check size={12} color={Colors.accent} strokeWidth={3} />
                <Txt style={[s.ingrLabel, { color: Colors.accent }]}>
                  In your kitchen
                </Txt>
              </View>
              {partitioned.fromKitchen.map((ing, i) => (
                <IngredientRow key={`have-${i}`} ing={ing} have />
              ))}
            </View>
          )}

          {partitioned && partitioned.needToBuy.length > 0 && (
            <View style={s.ingrBlock}>
              <View style={s.ingrLabelRow}>
                <ShoppingBasket size={12} color={Colors.secondary} strokeWidth={2.5} />
                <Txt style={s.ingrLabel}>
                  {partitioned.fromKitchen.length > 0 ? "You'll also need" : 'To buy'}
                </Txt>
              </View>
              {partitioned.needToBuy.map((ing, i) => (
                <IngredientRow key={`need-${i}`} ing={ing} />
              ))}
            </View>
          )}

          {(!partitioned || (partitioned.fromKitchen.length === 0 && partitioned.needToBuy.length === 0)) && (
            ingredients.map((ing, i) => <IngredientRow key={i} ing={ing} />)
          )}
        </View>

        <HandDivider />

        {/* ── Method ── */}
        <View style={s.section}>
          <SectionHeader emoji="👩‍🍳" title="How to make it" />
          {steps.map((step, i) => (
            <StepCard key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </View>

        {/* ── Chef tip ── */}
        {recipe.chef_tip && (
          <View style={s.tipCard}>
            <View style={s.tipIcon}>
              <Lightbulb size={14} color={Colors.accent} strokeWidth={2.5} fill={Colors.accent} fillOpacity={0.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={s.tipLabel}>CHEF'S TIP</Txt>
              <Txt style={s.tipBody}>{recipe.chef_tip}</Txt>
            </View>
          </View>
        )}

        <View style={s.endNote}>
          <Soup size={13} color={Colors.secondary} strokeWidth={2} />
          <Txt style={s.endNoteTxt}>Cooked with love · Nourish</Txt>
        </View>
      </ScrollView>

      {/* ── Sticky log CTA ── */}
      <View style={[s.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[s.logBtn, logged && s.logBtnDone, logging && s.logBtnLoading]}
          onPress={handleLog}
          activeOpacity={0.88}
          disabled={logging || logged}
        >
          {logging ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : logged ? (
            <>
              <Check size={18} color="#FFFFFF" strokeWidth={3} />
              <Txt style={s.logBtnTxt}>Logged for today</Txt>
            </>
          ) : (
            <>
              <Check size={18} color="#FFFFFF" strokeWidth={3} />
              <Txt style={s.logBtnTxt}>Log this meal</Txt>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={sh.wrap}>
      <Txt style={sh.emoji}>{emoji}</Txt>
      <Txt style={sh.title}>{title}</Txt>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emoji: { fontSize: 16, lineHeight: 20 },
  title: { fontSize: 14, fontWeight: '800', color: Colors.primary, letterSpacing: 0.3, textTransform: 'uppercase' },
});

function HandDivider() {
  return (
    <View style={hd.wrap}>
      <View style={hd.dot} />
      <View style={hd.dot} />
      <View style={hd.dot} />
    </View>
  );
}

const hd = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.border },
});

function IngredientRow({ ing, have }: { ing: Ingredient; have?: boolean }) {
  return (
    <View style={ir.row}>
      <View style={[ir.bullet, have && ir.bulletHave]} />
      <Txt style={[ir.name, have && ir.nameHave]}>{ing.name}</Txt>
      <Txt style={ir.qty}>{ing.quantity} {ing.unit}</Txt>
    </View>
  );
}

const ir = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bullet:     { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  bulletHave: { backgroundColor: Colors.accent },
  name:       { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: '500', lineHeight: 19 },
  nameHave:   { color: Colors.primary, fontWeight: '600' },
  qty:        { fontSize: 12, color: Colors.secondary, fontWeight: '600', lineHeight: 16 },
});

function StepCard({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <View style={sc.wrap}>
      <View style={sc.left}>
        <View style={sc.numCircle}>
          <Txt style={sc.num}>{String(step.n).padStart(2, '0')}</Txt>
        </View>
        {!isLast && <View style={sc.line} />}
      </View>
      <View style={sc.body}>
        <View style={sc.titleRow}>
          <Txt style={sc.title}>{step.title}</Txt>
          {step.minutes != null && (
            <View style={sc.minBadge}>
              <Clock size={9} color={Colors.secondary} strokeWidth={2.5} />
              <Txt style={sc.min}>{step.minutes}m</Txt>
            </View>
          )}
        </View>
        <Txt style={sc.txt}>{step.body}</Txt>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap:      { flexDirection: 'row', gap: 12 },
  left:      { width: 36, alignItems: 'center' },
  numCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  num:       { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5, lineHeight: 14 },
  line:      { width: 1.5, flex: 1, backgroundColor: Colors.accentLight, marginTop: 4, marginBottom: 4, minHeight: 14 },
  body:      { flex: 1, paddingBottom: 18, gap: 4 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:     { fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 19, flex: 1 },
  minBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.background, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7 },
  min:       { fontSize: 10, color: Colors.secondary, fontWeight: '700', lineHeight: 13 },
  txt:       { fontSize: 13, color: Colors.secondary, lineHeight: 19, fontWeight: '500' },
});

function MacroChip({ color, value, label, icon }: { color: string; value: string; label: string; icon: React.ReactNode }) {
  return (
    <View style={mch.wrap}>
      {icon}
      <Txt style={[mch.val, { color }]}>{value}</Txt>
      <Txt style={mch.lbl}>{label}</Txt>
    </View>
  );
}

const mch = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 10, gap: 2 },
  val:  { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  lbl:  { fontSize: 9, color: Colors.secondary, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 12 },
});

// ─── Loading screen ───────────────────────────────────────────────────────────
// Rotating chef-thought phrases so the wait feels like a real cook working,
// not a spinner. Each phrase swaps with a soft fade every ~1.8s.

const CHEF_THOUGHTS = [
  'Tempering the spices',
  'Asking grandma for her tip',
  'Tasting for salt',
  'Letting the masala bloom',
  'Plating it warm',
  'Garnishing with coriander',
];

function RecipeLoading({ mealName, insetTop }: { mealName: string; insetTop: number }) {
  const [thoughtIdx, setThoughtIdx] = useState(0);
  const thoughtOpacity = useRef(new Animated.Value(1)).current;
  const headerOpacity  = useRef(new Animated.Value(0)).current;
  const headerY        = useRef(new Animated.Value(12)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  // Header entrance.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerY,       { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [headerOpacity, headerY]);

  // Rotating thought.
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(thoughtOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setThoughtIdx((i) => (i + 1) % CHEF_THOUGHTS.length);
        Animated.timing(thoughtOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 1800);
    return () => clearInterval(id);
  }, [thoughtOpacity]);

  // Pulsing dots.
  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1,   duration: 400, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      );
    const anims = [pulse(dot1, 0), pulse(dot2, 150), pulse(dot3, 300)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={ld.root}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#FFF4E1', '#FFE8D6', Colors.accentLight]}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity
        style={[ld.back, { top: insetTop + 8 }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        hitSlop={12}
      >
        <ChevronLeft size={22} color={Colors.primary} strokeWidth={2.5} />
      </TouchableOpacity>

      <View style={ld.center}>
        <View style={ld.lottieWrap}>
          <View style={ld.halo} />
          <LottieView
            source={require('@/assets/lottie/cooking_pot.json')}
            style={ld.lottie}
            autoPlay
            loop
          />
        </View>

        <Animated.View style={{ opacity: headerOpacity, transform: [{ translateY: headerY }], alignItems: 'center', gap: 6 }}>
          <Txt style={ld.eyebrow}>COOKING UP YOUR</Txt>
          <Txt style={ld.mealName} numberOfLines={2}>{mealName}</Txt>
        </Animated.View>

        <Animated.View style={[ld.thoughtBox, { opacity: thoughtOpacity }]}>
          <Txt style={ld.thoughtEmoji}>👩‍🍳</Txt>
          <Txt style={ld.thought}>{CHEF_THOUGHTS[thoughtIdx]}…</Txt>
        </Animated.View>

        <View style={ld.dots}>
          <Animated.View style={[ld.dot, { opacity: dot1 }]} />
          <Animated.View style={[ld.dot, { opacity: dot2 }]} />
          <Animated.View style={[ld.dot, { opacity: dot3 }]} />
        </View>
      </View>
    </View>
  );
}

const ld = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.background },
  back:       { position: 'absolute', left: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },

  lottieWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  halo:       { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.55)' },
  lottie:     { width: 200, height: 200 },

  eyebrow:    { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 1.5, lineHeight: 15 },
  mealName:   { fontSize: 24, fontWeight: '800', color: Colors.primary, textAlign: 'center', lineHeight: 30, letterSpacing: -0.3 },

  thoughtBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.7)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, marginTop: 4 },
  thoughtEmoji: { fontSize: 16 },
  thought:    { fontSize: 13, fontWeight: '600', color: Colors.primary, fontStyle: 'italic', lineHeight: 17 },

  dots:       { flexDirection: 'row', gap: 8, marginTop: 8 },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Error
  errorWrap: { flex: 1, backgroundColor: Colors.background },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', margin: 16 },
  errorBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  errorEmoji:{ fontSize: 44 },
  errorTitle:{ fontSize: 17, fontWeight: '800', color: Colors.primary, marginTop: 8 },
  errorHint: { fontSize: 13, color: Colors.secondary, textAlign: 'center' },

  // Hero
  hero:       { paddingHorizontal: 18, paddingBottom: 24, gap: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 } }) },
  emojiHalo:  { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', marginVertical: 6, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 2 } }) },
  emoji:      { fontSize: 64, lineHeight: 76 },
  pillRow:    { flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  pill:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillEmoji:  { fontSize: 11, lineHeight: 14 },
  pillTxt:    { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.2, lineHeight: 14, textTransform: 'capitalize' },

  // Title
  titleBlock: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 6, gap: 8 },
  name:       { fontSize: 28, fontWeight: '800', color: Colors.primary, lineHeight: 34, letterSpacing: -0.6 },
  tagline:    { fontSize: 14, color: Colors.secondary, lineHeight: 20, fontStyle: 'italic', fontWeight: '500' },

  // Section
  section:    { paddingHorizontal: 22, paddingVertical: 14 },

  // Watch row
  creatorLine:    { fontSize: 12, color: Colors.secondary, marginBottom: 10, fontWeight: '500' },
  creatorHandle:  { color: Colors.accent, fontWeight: '700' },
  watchRow:       { flexDirection: 'row', gap: 10 },
  watchCard:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  watchIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  watchPlatform:  { fontSize: 13, fontWeight: '800', color: Colors.primary, lineHeight: 17 },
  watchHint:      { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },

  // Macros
  macroRow:     { flexDirection: 'row', gap: 10 },
  macroCellBig: { flex: 1.1, backgroundColor: Colors.accentLight, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  macroBigVal:  { fontSize: 26, fontWeight: '800', color: Colors.accent, letterSpacing: -0.5, lineHeight: 30 },
  macroBigLbl:  { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 13 },
  macroGrid:    { flex: 1.4, flexDirection: 'row', gap: 6 },

  // Ingredients
  ingrBlock:    { marginBottom: 10 },
  ingrLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, marginTop: 4 },
  ingrLabel:    { fontSize: 11, fontWeight: '800', color: Colors.secondary, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Chef tip
  tipCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 22, marginTop: 8, marginBottom: 6, backgroundColor: Colors.accentLight, borderRadius: 14, padding: 14 },
  tipIcon:  { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  tipLabel: { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 0.8, lineHeight: 13 },
  tipBody:  { fontSize: 13, color: Colors.primary, lineHeight: 19, fontWeight: '500', marginTop: 3, fontStyle: 'italic' },

  endNote:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 22 },
  endNoteTxt: { fontSize: 11, fontWeight: '600', color: Colors.secondary, letterSpacing: 0.3 },

  // Sticky CTA
  stickyBar:    { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 12, backgroundColor: 'rgba(247,245,242,0.96)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  logBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, backgroundColor: Colors.accent, borderRadius: 14, ...Platform.select({ ios: { shadowColor: Colors.accent, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 2 } }) },
  logBtnDone:   { backgroundColor: '#3FA56B' },
  logBtnLoading:{ opacity: 0.7 },
  logBtnTxt:    { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2, lineHeight: 19 },
});
