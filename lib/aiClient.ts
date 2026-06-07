// Thin wrapper around supabase.functions.invoke() that:
//   1. Surfaces our edge-fn error codes as typed exceptions
//   2. Bubbles 429 (rate limit) to the Pro UI for a friendly toast
//
// Call sites should prefer `useAI()` from features/pro/ProContext, which
// calls this and routes 429s to the global toast. Direct callers can use
// `invokeAI` if they want to handle errors locally.

import { supabase } from '@/lib/supabase';

export type AIErrorCode =
  | 'rate_limited'
  | 'openai_error'
  | 'unauthorized'
  | 'unknown';

export class AIError extends Error {
  code:    AIErrorCode;
  status:  number;
  payload: Record<string, unknown> | null;

  constructor(code: AIErrorCode, message: string, status: number, payload: Record<string, unknown> | null) {
    super(message);
    this.code    = code;
    this.status  = status;
    this.payload = payload;
  }
}

interface InvokeErrorContext {
  status?: number;
  text?:   () => Promise<string>;
  json?:   () => Promise<unknown>;
}

async function readErrorBody(ctx: unknown): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const c = ctx as InvokeErrorContext | undefined;
  const status = c?.status ?? 500;
  if (!c) return { status, body: null };
  try {
    if (typeof c.json === 'function') {
      const b = await c.json();
      if (b && typeof b === 'object') return { status, body: b as Record<string, unknown> };
    }
    if (typeof c.text === 'function') {
      const t = await c.text();
      if (t) return { status, body: JSON.parse(t) as Record<string, unknown> };
    }
  } catch {
    /* swallow — body wasn't JSON */
  }
  return { status, body: null };
}

function codeFromStatus(status: number, body: Record<string, unknown> | null): AIErrorCode {
  const explicit = body?.code as AIErrorCode | undefined;
  if (explicit) return explicit;
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 502) return 'openai_error';
  return 'unknown';
}

type InvokeBody = Record<string, unknown> | undefined;

export async function invokeAI<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as InvokeBody });

  if (error) {
    const { status, body: errBody } = await readErrorBody((error as { context?: unknown }).context);
    const code = codeFromStatus(status, errBody);
    const msg  = (errBody?.error as string | undefined) ?? error.message ?? 'AI call failed';
    throw new AIError(code, msg, status, errBody);
  }

  // Some functions return 200 with { error: '...' } in body. Treat as failure.
  if (data && typeof data === 'object' && 'error' in data && (data as { error: unknown }).error) {
    const msg = String((data as { error: unknown }).error);
    throw new AIError('unknown', msg, 200, data as Record<string, unknown>);
  }

  return data as T;
}
