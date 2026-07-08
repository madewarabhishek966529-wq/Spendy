// ============================================================================
// Spendy — Auth Service
// Wraps Supabase Auth: Google sign-in, session restore, logout, and a
// pub/sub layer so any page can react to auth state changes (e.g. to
// refresh the dashboard or redirect on logout).
// ============================================================================

import { supabase } from './supabaseClient.js';

const listeners = new Set();
let currentSession = null;
let initialized = false;

/**
 * Subscribe to auth state changes. Returns an unsubscribe function.
 * @param {(session: import('@supabase/supabase-js').Session | null) => void} callback
 */
export function onAuthStateChange(callback) {
  listeners.add(callback);
  // Fire immediately with current known state so late subscribers don't miss it.
  if (initialized) callback(currentSession);
  return () => listeners.delete(callback);
}

function notify(session) {
  currentSession = session;
  for (const cb of listeners) cb(session);
}

/**
 * Must be called once on app load (before any protected-page checks) to
 * restore the session from storage and wire up the live listener.
 */
export async function initAuth() {
  if (initialized) return currentSession;

  const { data, error } = await supabase.auth.getSession();
  if (error) console.error('[Spendy] Failed to restore session:', error.message);

  currentSession = data?.session ?? null;
  initialized = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    notify(session);
  });

  notify(currentSession);
  return currentSession;
}

/** Kick off Google OAuth. Supabase handles the redirect round-trip. */
export async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}/pages/dashboard.html`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/pages/login.html';
}

export function getCurrentSession() {
  return currentSession;
}

export function getCurrentUser() {
  return currentSession?.user ?? null;
}

export function isAuthenticated() {
  return Boolean(currentSession?.user);
}
