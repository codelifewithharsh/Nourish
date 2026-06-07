// Lightweight hook for reading text values from the `app_config` table.
//
// Use this from any screen that needs a live-tunable string (taglines,
// prices, marketing copy). The table is RLS-readable by anon, so pre-auth
// screens work too.
//
// Results are cached in module scope per-key after the first successful
// read, so re-mounting the same screen doesn't re-hit the network.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const cache = new Map<string, string>();

export function useAppConfigText(key: string, defaultValue = ''): string {
  const [value, setValue] = useState<string>(cache.get(key) ?? defaultValue);

  useEffect(() => {
    if (cache.has(key)) return;
    let aborted = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_config_text', { p_key: key, p_default: defaultValue });
        if (aborted) return;
        const next = typeof data === 'string' ? data : defaultValue;
        cache.set(key, next);
        setValue(next);
      } catch {
        /* network error — default stays */
      }
    })();
    return () => { aborted = true; };
  }, [key, defaultValue]);

  return value;
}
