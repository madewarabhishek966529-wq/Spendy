// ============================================================================
// Spendy — Dashboard Entry Script (Phase 1 shell)
// Proves the auth loop: guard, session restore, profile display, logout.
// Full widgets (balance, charts, AI insights) are added in Phase 3.
// ============================================================================

import { requireAuth, currentUserOrRedirect } from '../utils/routeGuard.js';
import { signOut } from '../services/authService.js';
import { supabase } from '../services/supabaseClient.js';
import { toast } from '../components/toast.js';
import { applyStoredTheme } from '../utils/theme.js';

applyStoredTheme();

const user = await requireAuth();
if (user) {
  renderUser(user);
  await loadProfile(user.id);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await signOut();
    toast.success('Logged out');
  } catch (err) {
    console.error('[Spendy] Logout failed:', err);
    toast.error('Could not log out. Please try again.');
  }
});

function renderUser(u) {
  const meta = u.user_metadata ?? {};
  document.getElementById('user-avatar').src = meta.avatar_url ?? '';
  document.getElementById('user-name').textContent = meta.full_name ?? meta.name ?? u.email;
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, created_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[Spendy] Failed to load profile:', error.message);
    toast.error('Could not load your profile.');
    return;
  }
  // Profile confirmed present — the handle_new_user trigger worked correctly.
  console.info('[Spendy] Profile loaded:', data);
}

// Redirect immediately if the user's session is invalidated elsewhere
// (e.g. logged out on another device / token revoked).
currentUserOrRedirect();
