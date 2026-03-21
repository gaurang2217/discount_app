import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error(`Missing env: SUPABASE_URL=${url ? 'ok' : 'MISSING'}, SUPABASE_SERVICE_KEY=${key ? 'ok' : 'MISSING'}`);
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Backwards-compat default export used across routes
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
