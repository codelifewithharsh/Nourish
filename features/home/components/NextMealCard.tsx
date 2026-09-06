import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { useAI } from '@/features/pro';
import { haptic } from '@/lib/haptics';

export interface NextMeal {
  type:     string;
  name:     string;
  calories: number;
  protein:  number;
}

interface Props {
  meal:     NextMeal;
  logging:  boolean;
  onLog:    () => void;
  onPress?: () => void;
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

/**
 * The next planned meal, with a picture of the dish.
 *
 * Images come from `dish-image`, which generates once per dish and caches the
 * result globally — so the first user to reach a dish pays for it and everyone
 * after that gets it free. While it loads, and if it fails, the card falls
 * back to a tinted panel with the meal emoji rather than an empty gap.
 */
export function NextMealCard({ meal, logging, onLog, onPress }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed]     = useState(false);
  const invoke = useAI();

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setFailed(false);

    invoke<{ url: string }>('dish-image', { meal_name: meal.name })
      .then((res) => { if (!cancelled) setImageUrl(res.url); })
      // A missing picture must never break the card — it is decoration, not
      // information. Rate limits land here too and are handled the same way.
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [meal.name, invoke]);

  return (
    <View style={s.card}>
      <TouchableOpacity activeOpacity={onPress ? 0.9 : 1} onPress={onPress} disabled={!onPress}>
        <View style={s.imageWrap}>
          {imageUrl && !failed ? (
            <Image
              source={{ uri: imageUrl }}
              style={s.image}
              contentFit="cover"
              transition={220}
              onError={() => setFailed(true)}
            />
          ) : (
            <View style={s.placeholder}>
              {failed
                ? <Txt style={s.placeholderEmoji}>{MEAL_EMOJI[meal.type] ?? '🍽️'}</Txt>
                : <ActivityIndicator size="small" color={Colors.accent} />}
            </View>
          )}

          <View style={s.badge}>
            <Txt style={s.badgeTxt}>
              {MEAL_EMOJI[meal.type] ?? '🍽️'}  {MEAL_LABEL[meal.type] ?? 'Up next'}
            </Txt>
          </View>
        </View>

        <View style={s.body}>
          <Txt style={s.name} numberOfLines={2}>{meal.name}</Txt>
          <View style={s.metaRow}>
            <View style={s.metaChip}>
              <Txt style={s.metaTxt}>{meal.calories} kcal</Txt>
            </View>
            <View style={s.metaChip}>
              <Txt style={s.metaTxt}>{meal.protein}g protein</Txt>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.logBtn, logging && s.logBtnBusy]}
        onPress={() => { haptic.success(); onLog(); }}
        activeOpacity={0.85}
        disabled={logging}
      >
        {logging
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <>
              <Check size={18} color="#FFFFFF" strokeWidth={2.6} />
              <Txt style={s.logTxt}>I ate this</Txt>
            </>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 26,
    overflow: 'hidden',
  },
  imageWrap:   { position: 'relative' },
  image:       { width: '100%', height: 168, backgroundColor: Colors.background },
  placeholder: {
    width: '100%', height: 168,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderEmoji: { fontSize: 44 },
  badge: {
    position: 'absolute', top: 12, left: 12,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  badgeTxt: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  body:     { paddingHorizontal: 18, paddingTop: 14 },
  name:     { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 24 },
  metaRow:  { flexDirection: 'row', gap: 8, marginTop: 10 },
  metaChip: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.background,
  },
  metaTxt:  { fontSize: 12.5, fontWeight: '600', color: Colors.secondary },

  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: 18, marginTop: 14,
    paddingVertical: 15,
    borderRadius: 18,
    backgroundColor: Colors.accent,
  },
  logBtnBusy: { opacity: 0.7 },
  logTxt:     { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
