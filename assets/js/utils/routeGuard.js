// ============================================================================
// Spendy — Route Guard
// Call `requireAuth()` at the top of every protected page's entry script.
// Call `redirectIfAuthed()` on the login page so a logged-in user landing
// on /pages/login.html goes straight to the dashboard instead of seeing the
// login screen again.
// ============================================================================

import { initAuth, getCurrentUser } from '../services/authService.js';

const LOGIN_PATH = '/pages/login.html';
const DASHBOARD_PATH = '/pages/dashboard.html';

/**
 * Ensures a session exists before letting a protected page render.
 * Shows/hides an optional #auth-loading element while checking.
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
export async function requireAuth() {
  const loadingEl = document.getElementById('auth-loading');
  if (loadingEl) loadingEl.classList.remove('u-hidden');

  const session = await initAuth();

  if (loadingEl) loadingEl.classList.add('u-hidden');

  if (!session?.user) {
    window.location.href = LOGIN_PATH;
    return null;
  }
  return session.user;
}

/** For the login page: bounce already-authenticated users to the dashboard. */
export async function redirectIfAuthed() {
  const session = await initAuth();
  if (session?.user) {
    window.location.href = DASHBOARD_PATH;
  }
}

export function currentUserOrRedirect() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = LOGIN_PATH;
    return null;
  }
  return user;
}
