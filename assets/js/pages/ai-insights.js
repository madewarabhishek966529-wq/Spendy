// ============================================================================
// Spendy — AI Insights Page Entry Script (Phase 6)
// Calls the `generate-insights` Edge Function (GPT-5, cached in ai_reports
// for 6 hours) and renders the summary + insight cards. "Refresh insights"
// forces a fresh generation.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { toast } from '../components/toast.js';
import { icons } from '../utils/icons.js';
import { fetchAIInsights } from '../services/aiService.js';
import { escapeHtml } from '../utils/sanitize.js';

applyStoredTheme();

const INSIGHT_ICONS = {
  spending_summary: icons.analytics,
  category: icons.receipt,
  trend: icons.transactions,
  saving_tip: icons.sparkle,
  warning: icons.budget,
};

const user = await requireAuth();
if (user) {
  mountShell({ active: 'insights', title: 'AI Insights', user });

  const refreshBtn = document.getElementById('refresh-insights-btn');
  refreshBtn?.addEventListener('click', () => loadInsights(true));

  loadInsights(false);
}

async function loadInsights(forceRefresh) {
  const grid = document.getElementById('insight-card-grid');
  const refreshBtn = document.getElementById('refresh-insights-btn');
  if (!grid) return;

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = forceRefresh ? 'Refreshing…' : 'Refresh insights';
  }

  try {
    const { summary, insights, cached } = await fetchAIInsights(forceRefresh);

    if (!insights || insights.length === 0) {
      grid.innerHTML = `
        <div class="glass-card empty-state-block" style="grid-column: 1 / -1;">
          ${icons.insights}
          <h3>No insights yet</h3>
          <p>${escapeHtml(summary)}</p>
        </div>`;
    } else {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; padding: var(--sp-5);">
          <p style="font-size:var(--fs-lg); font-weight:600;">${escapeHtml(summary)}</p>
        </div>
        ${insights
          .map(
            (i) => `
          <div class="glass-card insight-card">
            <span class="insight-card__icon">${INSIGHT_ICONS[i.type] ?? icons.sparkle}</span>
            <div>
              <h3>${escapeHtml(i.title)}</h3>
              <p>${escapeHtml(i.detail)}</p>
            </div>
          </div>`
          )
          .join('')}
      `;
    }

    if (forceRefresh) toast.success('Insights refreshed.');
    else if (cached) toast.info('Showing your most recent AI insights.');
  } catch (err) {
    console.error('[Spendy] Failed to load AI insights:', err.message);
    toast.error(err.message || 'Could not load AI insights.');
    grid.innerHTML = `
      <div class="glass-card empty-state-block" style="grid-column: 1 / -1;">
        ${icons.insights}
        <h3>Couldn't load insights</h3>
        <p>Something went wrong reaching Spendy's AI. Try refreshing.</p>
      </div>`;
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh insights';
    }
  }
}
