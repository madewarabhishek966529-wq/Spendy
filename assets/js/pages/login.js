// ============================================================================
// Spendy — Login Page Entry Script
// ============================================================================

import { signInWithGoogle } from '../services/authService.js';
import { redirectIfAuthed } from '../utils/routeGuard.js';
import { toast } from '../components/toast.js';
import { applyStoredTheme } from '../utils/theme.js';

applyStoredTheme();

// If the user already has a valid session (e.g. reopened the tab), skip
// straight to the dashboard instead of showing the login screen.
redirectIfAuthed();

const signInBtn = document.getElementById('google-signin-btn');
const signInLabel = document.getElementById('google-signin-label');

signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true;
  const originalLabel = signInLabel.textContent;
  signInLabel.textContent = 'Redirecting to Google…';

  try {
    await signInWithGoogle();
    // Browser navigates away to Google's consent screen here;
    // no further UI work needed on this page.
  } catch (err) {
    console.error('[Spendy] Google sign-in failed:', err);
    toast.error('Could not start Google sign-in. Please try again.');
    signInBtn.disabled = false;
    signInLabel.textContent = originalLabel;
  }
});
