// Lightweight hook for reading Pro pricing config.
//
// Why this exists separately from ProContext: pre-auth screens (login,
// onboarding) need the price too, but they don't have a session yet so
// ProProvider isn't mounted. The `app_config` table is RLS-readable by
// anon, so we can fetch directly without auth.
//
// Cached in module scope after the first successful read so the second
// caller (e.g. opening login → onboarding) doesn't re-hit the network.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ProPricing {
  normalPrice: string;
  userPrice:   string;
}

const DEFAULT_PRICING: ProPricing = {
  normalPrice: '₹299/yr',
  userPrice:   'Free',
};

let cached: ProPricing | null = null;

export function useProPricing(): ProPricing {
  const [pricing, setPricing] = useState<ProPricing>(cached ?? DEFAULT_PRICING);

  useEffect(() => {
    if (cached) return;
    let aborted = false;
    (async () => {
      try {
        const [normalRes, userRes] = await Promise.all([
          supabase.rpc('get_config_text', { p_key: 'pro_price_normal', p_default: DEFAULT_PRICING.normalPrice }),
          supabase.rpc('get_config_text', { p_key: 'pro_price_user',   p_default: DEFAULT_PRICING.userPrice   }),
        ]);
        if (aborted) return;
        const next: ProPricing = {
          normalPrice: (typeof normalRes.data === 'string' && normalRes.data) || DEFAULT_PRICING.normalPrice,
          userPrice:   (typeof userRes.data   === 'string' && userRes.data)   || DEFAULT_PRICING.userPrice,
        };
        cached = next;
        setPricing(next);
      } catch {
        /* network error — defaults stay */
      }
    })();
    return () => { aborted = true; };
  }, []);

  return pricing;
}
