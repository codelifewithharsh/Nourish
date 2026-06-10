// Pro membership context.
//
// Replaces the old credits system. There's no balance to track and no
// per-call charge — every signup is Pro (the badge is cosmetic for now).
// The only user-visible state is a soft toast when someone hits the silent
// daily rate limit on an AI action.
//
// What this gives the rest of the app:
//   - useProMember() → { isPro, isEarlyBird, proSince, refresh }
//   - useAI()        → invoke wrapper that routes 429 to the global toast
//   - <ProProvider />  mounted once in _layout owns the rate-limit toast

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { AIError, invokeAI } from '@/lib/aiClient';

export interface ProMember {
  isPro:       boolean;
  isEarlyBird: boolean;
  proSince:    string | null;
}

export interface ProPricing {
  /** Crossed-out comparison price (e.g. "₹299/yr"). */
  normalPrice: string;
  /** What the user actually pays (e.g. "Free"). */
  userPrice:   string;
}

interface ProCtx extends ProMember {
  pricing:  ProPricing;
  refresh:  () => Promise<void>;
  invoke:   <T>(name: string, body?: Record<string, unknown>) => Promise<T>;
}

const DEFAULT_PRICING: ProPricing = {
  normalPrice: '₹299/yr',
  userPrice:   'Free',
};

const Ctx = createContext<ProCtx | null>(null);

export function useProMember() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProMember used outside ProProvider');
  return c;
}

/** Drop-in replacement for the old useAI hook. */
export function useAI() {
  const { invoke } = useProMember();
  return invoke;
}

export function ProProvider({ children }: { children: ReactNode }) {
  const [isPro,       setIsPro]       = useState(true);
  const [isEarlyBird, setIsEarlyBird] = useState(true);
  const [proSince,    setProSince]    = useState<string | null>(null);
  const [pricing,     setPricing]     = useState<ProPricing>(DEFAULT_PRICING);
  const [rateLimit,   setRateLimit]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Run both reads in parallel — pricing is shared (RLS-readable by all)
      // so it doesn't depend on the user row.
      const [profileRes, normalPriceRes, userPriceRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_pro, is_early_bird, pro_since')
          .eq('id', user.id)
          .single(),
        supabase.rpc('get_config_text', { p_key: 'pro_price_normal', p_default: DEFAULT_PRICING.normalPrice }),
        supabase.rpc('get_config_text', { p_key: 'pro_price_user',   p_default: DEFAULT_PRICING.userPrice   }),
      ]);

      if (profileRes.data) {
        const row = profileRes.data as { is_pro?: boolean; is_early_bird?: boolean; pro_since?: string | null };
        setIsPro(!!row.is_pro);
        setIsEarlyBird(!!row.is_early_bird);
        setProSince(row.pro_since ?? null);
      }

      setPricing({
        normalPrice: (typeof normalPriceRes.data === 'string' && normalPriceRes.data) || DEFAULT_PRICING.normalPrice,
        userPrice:   (typeof userPriceRes.data   === 'string' && userPriceRes.data)   || DEFAULT_PRICING.userPrice,
      });
    } catch {
      /* leave state as-is on network error */
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const invoke = useCallback(async <T,>(name: string, body?: Record<string, unknown>): Promise<T> => {
    try {
      return await invokeAI<T>(name, body);
    } catch (err) {
      if (err instanceof AIError && (err.code === 'rate_limited' || err.code === 'upgrade_required')) {
        setRateLimit(err.message || "You've used this a lot today — try again tomorrow.");
      }
      throw err;
    }
  }, []);

  const value = useMemo<ProCtx>(() => ({
    isPro, isEarlyBird, proSince, pricing, refresh, invoke,
  }), [isPro, isEarlyBird, proSince, pricing, refresh, invoke]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <RateLimitToast message={rateLimit} onDismiss={() => setRateLimit(null)} />
    </Ctx.Provider>
  );
}

// ─── Soft 429 toast ───────────────────────────────────────────────────
// Top-anchored, accent-tinted, auto-dismisses after 4.5s. Tone is warm —
// users hit this rarely and the goal is to make them feel taken care of,
// not throttled.
function RateLimitToast({
  message, onDismiss,
}: {
  message:   string | null;
  onDismiss: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const ty      = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    if (!message) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(ty,      { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0,   duration: 220, useNativeDriver: true }),
        Animated.timing(ty,      { toValue: -30, duration: 220, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 4500);

    return () => clearTimeout(t);
  }, [message, opacity, ty, onDismiss]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[t.wrap, { top: insets.top + 8, opacity, transform: [{ translateY: ty }] }]}
    >
      <View style={t.toast}>
        <View style={t.iconWrap}>
          <Sparkles size={14} color={Colors.accent} strokeWidth={2.4} fill={Colors.accent} fillOpacity={0.25} />
        </View>
        <Txt style={t.toastTxt}>{message}</Txt>
      </View>
    </Animated.View>
  );
}

const t = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.accentLight,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  toastTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    lineHeight: 18,
  },
});
