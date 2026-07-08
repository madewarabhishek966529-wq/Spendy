// ============================================================================
// Spendy — Shared Auth Helper for Edge Functions
//
// Every function that touches user data must:
//   1. Verify the caller's JWT (never trust a client-supplied user_id).
//   2. Use a client scoped to that JWT for any read/write that should be
//      subject to RLS (e.g. reading the user's own transactions/receipts).
//   3. Only reach for the service-role ("admin") client when a write must
//      bypass RLS by design (e.g. inserting into ai_reports, which has no
//      client-side insert policy on purpose) — and even then, the row's
//      user_id must come from the verified JWT, never from the request body.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Verify the Authorization header and return the authenticated user plus
 * two clients: `userClient` (RLS-scoped, acts as the caller) and
 * `adminClient` (service role, bypasses RLS — use sparingly and only after
 * verifying the user).
 */
export async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { error: 'Missing Authorization header.' as const };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    return { error: 'Invalid or expired session.' as const };
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return { user: data.user, userClient, adminClient };
}
