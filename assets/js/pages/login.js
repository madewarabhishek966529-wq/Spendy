// ============================================================================
// Spendy — Login Page Entry Script
// ============================================================================
//
// NOTE ON THE "BUTTON DOES NOTHING" BUG:
// This file used to `import { signInWithGoogle } from '../services/authService.js'`
// as a static top-of-file import. authService.js imports supabaseClient.js,
// which throws at module-evaluation time whenever config.js hasn't been
// built (see supabaseClient.js for the full explanation). With static ES
// module imports, if any module in the dependency graph throws while being
// evaluated, the *importing* module (this file) never executes its own body
// at all — not even code wrapped in try/catch, because the failure happens
// during import resolution, before this file's code runs. That's why the
// click listener was never attached, and clicking the button produced
// literally zero effect: no console.log, no network call, no popup.
//
// Fix: attach the DOM refs and a *working* click handler first (so the
// button always does something visible), then dynamically `import()` the
// auth modules inside a try/catch so a config/auth failure degrades
// gracefully — the button gets disabled with a clear on-page + toast error
// instead of silently doing nothing.
// ============================================================================

import { toast } from '../components/toast.js';
import { applyStoredTheme } from '../utils/theme.js';

applyStoredTheme();

const signInBtn = document.getElementById('google-signin-btn');
const signInLabel = document.getElementById('google-signin-label');

console.log('[Spendy] login.js loaded, wiring up "Continue with Google" button.');

let signInWithGoogle = null;

// Attach the click listener immediately (synchronously), independent of
// whether the auth stack finishes loading. This guarantees clicking the
// button always produces some visible feedback.
signInBtn.addEventListener('click', async () => {
  console.log('[Spendy] "Continue with Google" clicked.');

  if (!signInWithGoogle) {
    console.error('[Spendy] Google sign-in unavailable — auth module failed to initialize.');
    toast.error('Sign-in is temporarily unavailable. Please refresh the page or try again shortly.');
    return;
  }

  signInBtn.disabled = true;
  const originalLabel = signInLabel.textContent;
  signInLabel.textContent = 'Redirecting to Google…';

  try {
    console.log('[Spendy] Calling signInWithGoogle()…');
    await signInWithGoogle();
    // Browser navigates away to Google's consent screen here;
    // no further UI work needed on this page.
  } catch (err) {
    console.error('[Spendy] Google sign-in failed:', err);
    toast.error(err?.message || 'Could not start Google sign-in. Please try again.');
    signInBtn.disabled = false;
    signInLabel.textContent = originalLabel;
  }
});

// Load the auth stack via dynamic import, so a failure here can't prevent
// the click listener above from ever being attached.
(async () => {
  try {
    const authService = await import('../services/authService.js');
    const routeGuard = await import('../utils/routeGuard.js');

    signInWithGoogle = authService.signInWithGoogle;
    console.log('[Spendy] Auth module initialized successfully.');

    // If the user already has a valid session (e.g. reopened the tab), skip
    // straight to the dashboard instead of showing the login screen.
    await routeGuard.redirectIfAuthed();
  } catch (err) {
    console.error('[Spendy] Failed to initialize auth module:', err);
    signInBtn.disabled = true;
    signInLabel.textContent = 'Sign-in unavailable';
    toast.error('Sign-in could not be initialized. Check the console for details.');
  }
})();
