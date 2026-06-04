// Global credits state + error UX.
//
// What this gives the rest of the app:
//   - useCredits()  → { balance, refresh } for showing balance anywhere
//   - useAI()       → wrapper around invokeAI that routes errors here
//   - <CreditsProvider /> mounted once in _layout owns the 402 modal and
//     429 toast so every screen gets consistent handling for free.
//
// The pattern: balance is a read-through cache of profiles.credits. We
// refresh on mount, on auth changes, and after every AI call (which mutates
// it). Strong consistency is unnecessary — the source of truth lives in
// the DB and edge functions validate atomically.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, Animated, Easing, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, BellRing, Check } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Txt } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { AIError, invokeAI } from '@/lib/aiClient';
import { analytics } from '@/lib/analytics';
import { COST, DAILY_REFILL } from './costs';

interface CreditsCtx {
  balance:        number | null;
  refresh:        () => Promise<void>;
  invoke:         <T>(name: string, body?: Record<string, unknown>) => Promise<T>;
}

const Ctx = createContext<CreditsCtx | null>(null);

export function useCredits() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCredits used outside CreditsProvider');
  return c;
}

/** Use this everywhere instead of supabase.functions.invoke for AI endpoints. */
export function useAI() {
  const { invoke } = useCredits();
  return invoke;
}

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [balance,    setBalance]    = useState<number | null>(null);
  const [outOfCreds, setOutOfCreds] = useState(false);
  const [rateLimit,  setRateLimit]  = useState<string | null>(null);
  const [introToast, setIntroToast] = useState<number | null>(null);
  // We track this in a ref so the invoke callback can read the latest value
  // without resubscribing every render.
  const introSeenRef = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    console.log('[credits] refresh start');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[credits] refresh user:', user?.email ?? 'none');
      if (!user) { setBalance(null); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('credits, credits_intro_seen')
        .eq('id', user.id)
        .single();
      console.log('[credits] refresh profile:', data, 'error:', error);
      if (data) {
        setBalance(data.credits);
        introSeenRef.current = !!data.credits_intro_seen;
      }
    } catch (e) {
      console.log('[credits] refresh ERROR:', e);
    }
  }, []);

  useEffect(() => {
    console.log('[credits] provider mount');
    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log('[credits] auth event:', event);
      refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const invoke = useCallback(async <T,>(name: string, body?: Record<string, unknown>): Promise<T> => {
    try {
      const result = await invokeAI<T>(name, body);
      // Best-effort refresh — every successful call may have changed balance.
      await refresh();
      const cost = COST[name as keyof typeof COST] ?? 0;
      analytics.creditsUsed({ feature: name, cost, remaining: balance ?? 0 });

      // One-time intro toast after the first successful meal-plan generation.
      // After refresh(), introSeenRef holds the just-fetched flag — if it's
      // still false, this was the user's first plan. Mark it seen in the DB
      // (fire-and-forget) and surface the toast.
      if (name === 'generate-meal-plan' && !introSeenRef.current) {
        introSeenRef.current = true;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          supabase.from('profiles')
            .update({ credits_intro_seen: true })
            .eq('id', user.id)
            .then(() => {});
        }
        // Show with the refreshed balance.
        setBalance((curr) => { if (curr != null) setIntroToast(curr); return curr; });
      }

      return result;
    } catch (err) {
      if (err instanceof AIError) {
        if (err.code === 'no_credits') {
          refresh();
          setOutOfCreds(true);
          analytics.outOfCredits({ feature: name });
        } else if (err.code === 'rate_limited') {
          setRateLimit(err.message || 'Daily limit reached — try again tomorrow');
        }
      }
      throw err;
    }
  }, [refresh]);

  const value = useMemo(() => ({ balance, refresh, invoke }), [balance, refresh, invoke]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <OutOfCreditsModal
        visible={outOfCreds}
        balance={balance}
        onClose={() => setOutOfCreds(false)}
      />
      <RateLimitToast
        message={rateLimit}
        onDismiss={() => setRateLimit(null)}
      />
      <CreditsIntroToast
        balance={introToast}
        onDismiss={() => setIntroToast(null)}
      />
    </Ctx.Provider>
  );
}

// ─── 402 modal ───────────────────────────────────────────────────────
// Shown when the server returns no_credits. Beyond the explainer, this
// modal captures *intent* for paid packs via the credit_pack_interest
// waitlist. Toggle is idempotent (upserts/deletes the user's row) so
// users can opt in/out without ceremony.
function OutOfCreditsModal({
  visible, balance, onClose,
}: {
  visible:  boolean;
  balance:  number | null;
  onClose:  () => void;
}) {
  const [interested,  setInterested]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Fetch current waitlist state when modal opens.
  useEffect(() => {
    if (!visible) { setInitialized(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setInitialized(true); return; }
      const { data } = await supabase
        .from('credit_pack_interest')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setInterested(!!data);
      setInitialized(true);
    })();
  }, [visible]);

  const toggleInterest = async (next: boolean) => {
    setSaving(true);
    setInterested(next); // Optimistic.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    if (next) {
      await supabase.from('credit_pack_interest').upsert({ user_id: user.id });
    } else {
      await supabase.from('credit_pack_interest').delete().eq('user_id', user.id);
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <View style={m.sheet}>
          <View style={m.iconWrap}>
            <Coins size={30} color={Colors.accent} />
          </View>
          <Txt style={m.title}>You're out of credits</Txt>
          <Txt style={m.body}>
            Credits power your meal plans, recipes and smart logs. You'll get
            <Txt style={m.bodyStrong}> {DAILY_REFILL} fresh credits </Txt>
            again tomorrow morning.
          </Txt>
          {balance != null && (
            <Txt style={m.balance}>Current balance: {balance}</Txt>
          )}

          {/* Waitlist toggle */}
          <View style={m.waitlistCard}>
            <View style={m.waitlistIconWrap}>
              {interested
                ? <Check size={15} color={Colors.accent} strokeWidth={3} />
                : <BellRing size={14} color={Colors.accent} strokeWidth={2.4} />
              }
            </View>
            <View style={m.waitlistInfo}>
              <Txt style={m.waitlistTitle}>
                {interested ? "You're on the list" : 'Notify me about credit packs'}
              </Txt>
              <Txt style={m.waitlistHint}>
                {interested
                  ? "We'll email you when packs launch."
                  : "Get more credits when paid packs are ready."
                }
              </Txt>
            </View>
            <Switch
              value={interested}
              onValueChange={toggleInterest}
              disabled={saving || !initialized}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity style={m.cta} onPress={onClose} activeOpacity={0.85}>
            <Txt style={m.ctaTxt}>Got it</Txt>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 429 toast ───────────────────────────────────────────────────────
function RateLimitToast({
  message, onDismiss,
}: {
  message:   string | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const ty      = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!message) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(ty,      { toValue: 0, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
        Animated.timing(ty,      { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 3000);

    return () => clearTimeout(t);
  }, [message, opacity, ty, onDismiss]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[t.wrap, { top: insets.top + 8, opacity, transform: [{ translateY: ty }] }]}
    >
      <View style={t.toast}>
        <Txt style={t.toastTxt}>{message}</Txt>
      </View>
    </Animated.View>
  );
}

// ─── One-time intro toast ─────────────────────────────────────────────
// Shown exactly once, right after the user's first successful AI plan
// generation. Tappable to dismiss; auto-dismisses after 6s. Uses a
// distinct accent style so it feels celebratory rather than warning.
function CreditsIntroToast({
  balance, onDismiss,
}: {
  balance:   number | null;
  onDismiss: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const ty      = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    if (balance == null) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(ty,      { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0,   duration: 220, useNativeDriver: true }),
        Animated.timing(ty,      { toValue: -30, duration: 220, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 6000);

    return () => clearTimeout(t);
  }, [balance, opacity, ty, onDismiss]);

  if (balance == null) return null;
  return (
    <Animated.View
      style={[ti.wrap, { top: insets.top + 8, opacity, transform: [{ translateY: ty }] }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onDismiss} style={ti.toast}>
        <View style={ti.iconWrap}>
          <Coins size={16} color={Colors.accent} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={ti.title}>{balance} credits left</Txt>
          <Txt style={ti.body}>
            Credits power AI features. {DAILY_REFILL} fresh ones land every morning, free.
          </Txt>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: Colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  bodyStrong: { color: Colors.primary, fontWeight: '700' },
  balance: {
    fontSize: 13,
    color: Colors.secondary,
    marginTop: 4,
  },
  cta: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaTxt: {
    color: Colors.surface,
    fontWeight: '700',
    fontSize: 15,
  },

  waitlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  waitlistIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  waitlistInfo:  { flex: 1, gap: 2 },
  waitlistTitle: { fontSize: 13, fontWeight: '800', color: Colors.primary, lineHeight: 17 },
  waitlistHint:  { fontSize: 11, color: Colors.secondary, lineHeight: 14, fontWeight: '500' },
});

const t = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    maxWidth: '100%',
  },
  toastTxt: {
    color: Colors.surface,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const ti = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 18, letterSpacing: -0.2 },
  body:  { fontSize: 12, color: Colors.secondary, lineHeight: 16, fontWeight: '500', marginTop: 2 },
});

