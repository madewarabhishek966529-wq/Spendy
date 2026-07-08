// ============================================================================
// Spendy — App Shell
// Every authenticated page calls `mountShell({ active, title, user })` once
// it has a confirmed user. Renders the sidebar + topbar into the page's
// #app-sidebar / #app-topbar containers, wires up theme toggle, mobile nav,
// active-link highlighting, and logout.
// ============================================================================

import { icons } from './icons.js';
import { signOut } from '../services/authService.js';
import { toggleTheme, getTheme } from './theme.js';
import { toast } from '../components/toast.js';
import { escapeHtml } from './sanitize.js';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/pages/dashboard.html', icon: icons.dashboard },
  { key: 'transactions', label: 'Transactions', href: '/pages/transactions.html', icon: icons.transactions },
  { key: 'analytics', label: 'Analytics', href: '/pages/analytics.html', icon: icons.analytics },
  { key: 'budget', label: 'Budget', href: '/pages/budget.html', icon: icons.budget },
  { key: 'insights', label: 'AI Insights', href: '/pages/ai-insights.html', icon: icons.insights },
  { key: 'profile', label: 'Profile', href: '/pages/profile.html', icon: icons.profile },
  { key: 'settings', label: 'Settings', href: '/pages/settings.html', icon: icons.settings },
];

/**
 * @param {Object} opts
 * @param {string} opts.active - key of the current page (see NAV_ITEMS)
 * @param {string} opts.title - heading shown in the topbar
 * @param {import('@supabase/supabase-js').User} opts.user
 */
export function mountShell({ active, title, user }) {
  renderSidebar(active);
  renderTopbar(title, user);
  wireThemeToggle();
  wireMobileNav();
  wireLogout();
}

function renderSidebar(active) {
  const el = document.getElementById('app-sidebar');
  if (!el) return;

  const links = NAV_ITEMS.map(
    (item) => `
      <a class="sidebar-link${item.key === active ? ' is-active' : ''}" href="${item.href}">
        ${item.icon}<span>${item.label}</span>
      </a>`
  ).join('');

  el.innerHTML = `
    <div class="sidebar-brand">
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="url(#spendy-grad)"/>
        <path d="M12 24c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M20 12v4M20 24v4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <defs>
          <linearGradient id="spendy-grad" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stop-color="#10B981"/>
            <stop offset="50%" stop-color="#06B6D4"/>
            <stop offset="100%" stop-color="#4F46E5"/>
          </linearGradient>
        </defs>
      </svg>
      <span class="sidebar-brand__name">Spendy</span>
    </div>
    <nav class="sidebar-nav">${links}</nav>
    <div class="sidebar-footer">
      <button id="shell-logout-btn" class="sidebar-link" style="width:100%;">
        ${icons.logout}<span>Log out</span>
      </button>
    </div>
  `;

  const scrim = document.createElement('div');
  scrim.className = 'sidebar-scrim';
  scrim.id = 'sidebar-scrim';
  document.body.appendChild(scrim);
}

function renderTopbar(title, user) {
  const el = document.getElementById('app-topbar');
  if (!el) return;

  const meta = user?.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? user?.email ?? '';
  const avatar = meta.avatar_url ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
  const currentTheme = getTheme();

  el.innerHTML = `
    <div class="u-flex" style="align-items:center; gap:var(--sp-3);">
      <button id="sidebar-toggle-btn" class="icon-btn sidebar-toggle" aria-label="Toggle navigation">${icons.menu}</button>
      <h1 class="topbar-title">${title}</h1>
    </div>
    <div class="topbar-actions">
      <button id="theme-toggle-btn" class="icon-btn" aria-label="Toggle dark mode">
        ${currentTheme === 'dark' ? icons.sun : icons.moon}
      </button>
      <div class="user-menu">
        <img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" referrerpolicy="no-referrer" />
        <span class="user-menu__name">${escapeHtml(name)}</span>
      </div>
    </div>
  `;
}

function wireThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = toggleTheme();
    btn.innerHTML = next === 'dark' ? icons.sun : icons.moon;
  });
}

function wireMobileNav() {
  const toggle = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.getElementById('app-sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  if (!toggle || !sidebar || !scrim) return;

  const close = () => {
    sidebar.classList.remove('is-open');
    scrim.classList.remove('is-visible');
  };
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('is-open');
    scrim.classList.toggle('is-visible');
  });
  scrim.addEventListener('click', close);
}

function wireLogout() {
  const btn = document.getElementById('shell-logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('[Spendy] Logout failed:', err.message);
      toast.error('Could not log out. Please try again.');
    }
  });
}
