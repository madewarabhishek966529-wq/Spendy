// ============================================================================
// Spendy — Settings Page Entry Script
// Theme toggle is fully live. Currency and notification preferences persist
// to `profiles` once that update path is wired in Phase 3/6; the controls
// are interactive now but currently just reflect local UI state.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { applyStoredTheme, getTheme, toggleTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { signOut } from '../services/authService.js';
import { toast } from '../components/toast.js';

applyStoredTheme();

const user = await requireAuth();
if (user) {
  mountShell({ active: 'settings', title: 'Settings', user });
  document.getElementById('settings-account-email').textContent = user.email;
  initThemeToggle();
  initToggleSwitches();
  wireLogout();
}

function initThemeToggle() {
  const btn = document.getElementById('settings-theme-toggle');
  const sync = () => {
    const isDark = getTheme() === 'dark';
    btn.classList.toggle('is-on', isDark);
    btn.setAttribute('aria-checked', String(isDark));
  };
  sync();
  btn.addEventListener('click', () => {
    toggleTheme();
    sync();
  });
}

function initToggleSwitches() {
  document.querySelectorAll('.toggle-switch:not(#settings-theme-toggle)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isOn = btn.classList.toggle('is-on');
      btn.setAttribute('aria-checked', String(isOn));
    });
  });
}

function wireLogout() {
  document.getElementById('settings-logout-btn')?.addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('[Spendy] Logout failed:', err.message);
      toast.error('Could not log out. Please try again.');
    }
  });
}
