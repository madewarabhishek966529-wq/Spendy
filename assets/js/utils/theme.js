// ============================================================================
// Spendy — Theme Utility
// Applies saved theme before first paint (call at top of every page script)
// and exposes a toggle for the settings page / navbar switch.
// ============================================================================

const STORAGE_KEY = 'spendy-theme';

export function applyStoredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved ?? (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
