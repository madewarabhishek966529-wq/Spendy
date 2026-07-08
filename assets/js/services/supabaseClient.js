// ============================================================================
// Spendy — Supabase Client Service
// Single source of truth for the Supabase connection. Every other module
// imports `supabase` from here instead of creating its own client.
// ============================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SPENDY_CONFIG } from '../utils/config.js';

// DEBUG: confirms whether config.js made it into the browser with real
// values, vs. still holding unbuilt `__SPENDY_ENV__...__` placeholders.
console.log('[Spendy] Loaded SPENDY_CONFIG:', SPENDY_CONFIG);

const isUnresolvedPlaceholder = (value) =>
  typeof value === 'string' && value.startsWith('__SPENDY_ENV__');

// ROOT-CAUSE GUARD: previously this only checked for missing/empty values.
// But an *unbuilt* config.js still has non-empty strings — the literal
// placeholder tokens `__SPENDY_ENV__SUPABASE_URL__` etc. — so that check
// silently passed, and `createClient()` below threw its own cryptic
// `TypeError: Invalid URL` while evaluating this module. Because that
// throw happened at module-evaluation time (not inside a function), it
// aborted the entire import chain (supabaseClient.js -> authService.js ->
// login.js) *before* login.js ever reached the line that attaches the
// "Continue with Google" click listener — which is why the button did
// nothing at all, with no popup, no network call, and no visible error.
// Now we detect the placeholder case explicitly and fail with a clear,
// actionable message instead.
if (
  !SPENDY_CONFIG.SUPABASE_URL ||
  !SPENDY_CONFIG.SUPABASE_ANON_KEY ||
  isUnresolvedPlaceholder(SPENDY_CONFIG.SUPABASE_URL) ||
  isUnresolvedPlaceholder(SPENDY_CONFIG.SUPABASE_ANON_KEY)
) {
  const message =
    '[Spendy] Supabase is not configured — config.js still has unbuilt ' +
    '__SPENDY_ENV__ placeholders (or empty values) instead of real ' +
    'SUPABASE_URL / SUPABASE_ANON_KEY. Run `npm run build:config` ' +
    '(after `cp .env.example .env` and filling in real values) before ' +
    'serving the app. This is why buttons that depend on Supabase, like ' +
    '"Continue with Google", silently do nothing.';
  console.error(message);
  throw new Error(message);
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

console.log('[Spendy] Supabase client initialized successfully.');
