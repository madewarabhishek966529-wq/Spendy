// ============================================================================
// Spendy — Profile Page Entry Script
// Renders Google account info immediately. Lifetime income/expense/balance/
// savings totals are computed from `transactions` once Phase 3's query
// layer exists; for now they show a neutral zero state.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { supabase } from '../services/supabaseClient.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { toast } from '../components/toast.js';

applyStoredTheme();

const user = await requireAuth();
if (user) {
  mountShell({ active: 'profile', title: 'Profile', user });
  renderAccountInfo(user);
  await loadProfileRow(user.id);
}

function renderAccountInfo(u) {
  const meta = u.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? u.email;
  document.getElementById('profile-avatar').src =
    meta.avatar_url ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = u.email;
}

async function loadProfileRow(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[Spendy] Failed to load profile row:', error.message);
    toast.error('Could not load account details.');
    return;
  }

  const since = new Date(data.created_at).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  document.getElementById('profile-since').textContent = `Member since ${since}`;
}
