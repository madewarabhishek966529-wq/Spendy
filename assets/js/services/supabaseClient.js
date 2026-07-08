// ============================================================================
// Spendy — Supabase Client Service
// Single source of truth for the Supabase connection. Every other module
// imports `supabase` from here instead of creating its own client.
// ============================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SPENDY_CONFIG } from '../utils/config.js';

if (!SPENDY_CONFIG.SUPABASE_URL || !SPENDY_CONFIG.SUPABASE_ANON_KEY) {
  throw new Error(
    '[Spendy] Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
    'in assets/js/utils/config.js (populated from environment variables at build/deploy time).'
  );
}

export const supabase = createClient(
  SPENDY_CONFIG.SUPABASE_URL,
  SPENDY_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'spendy-auth',
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
);
