// ============================================================================
// Spendy — Budget Page Entry Script (Phase 6)
// Lets the user set/update their monthly budget, then renders the progress
// ring, derived stats, and GPT-5-generated smart recommendations from the
// `budget-recommendation` Edge Function.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { toast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { supabase } from '../services/supabaseClient.js';
import { setMonthlyBudget } from '../services/budgetService.js';
import { fetchBudgetRecommendations } from '../services/aiService.js';
import { formatCurrency } from '../utils/formatters.js';
import { escapeHtml } from '../utils/sanitize.js';

applyStoredTheme();

let currentCurrency = 'INR';
const RING_CIRCUMFERENCE = 527; // matches r=84 in budget.html: 2 * PI * 84 ≈ 527.8

const user = await requireAuth();
if (user) {
  mountShell({ active: 'budget', title: 'Budget', user });

  try {
    const { data } = await supabase.from('profiles').select('currency').eq('id', user.id).single();
    currentCurrency = data?.currency ?? 'INR';
  } catch {
    /* default INR is fine */
  }

  document.getElementById('set-budget-btn')?.addEventListener('click', openBudgetModal);
  loadBudget(false);
}

function openBudgetModal() {
  const bodyHTML = `
    <form id="budget-form" novalidate>
      <div class="form-group">
        <label class="field-label" for="budget-amount">Monthly budget amount</label>
        <input class="field-input" id="budget-amount" type="number" min="1" step="1" required placeholder="e.g. 15000" />
      </div>
      <div class="form-group">
        <label class="field-label" for="budget-alert">Alert me when I've used</label>
        <select class="field-input" id="budget-alert">
          <option value="70">70% of my budget</option>
          <option value="80" selected>80% of my budget</option>
          <option value="90">90% of my budget</option>
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" id="budget-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn--primary" id="budget-submit-btn">Save budget</button>
      </div>
    </form>
  `;

  const { dialog } = openModal({ title: 'Set monthly budget', bodyHTML });
  dialog.querySelector('#budget-cancel-btn').addEventListener('click', closeModal);

  dialog.querySelector('#budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(dialog.querySelector('#budget-amount').value);
    const alertPercent = Number(dialog.querySelector('#budget-alert').value);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Please enter a valid amount.');

    const submitBtn = dialog.querySelector('#budget-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      await setMonthlyBudget(user.id, amount, alertPercent);
      toast.success('Monthly budget saved.');
      closeModal();
      loadBudget(true);
    } catch (err) {
      console.error('[Spendy] Failed to save budget:', err.message);
      toast.error(err.message || 'Could not save budget.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save budget';
    }
  });
}

async function loadBudget(forceRefresh) {
  const recPanel = document.getElementById('budget-recommendations');
  recPanel.innerHTML = `<p class="empty-state u-muted">Loading your budget status…</p>`;

  try {
    const data = await fetchBudgetRecommendations(forceRefresh);

    if (!data.budgetAmount) {
      recPanel.innerHTML = `<p class="empty-state u-muted">${data.message || 'Set a monthly budget to get personalized recommendations.'}</p>`;
      renderRing(0);
      document.getElementById('budget-total').textContent = 'Not set';
      document.getElementById('budget-spent').textContent = formatCurrency(0, currentCurrency);
      document.getElementById('budget-remaining').textContent = '—';
      document.getElementById('budget-daily-limit').textContent = '—';
      document.getElementById('budget-health-score').textContent = '—';
      return;
    }

    const percentUsed = data.budgetAmount > 0 ? Math.min((data.spent / data.budgetAmount) * 100, 100) : 0;
    renderRing(percentUsed);

    document.getElementById('budget-total').textContent = formatCurrency(data.budgetAmount, currentCurrency);
    document.getElementById('budget-spent').textContent = formatCurrency(data.spent, currentCurrency);
    document.getElementById('budget-remaining').textContent = formatCurrency(data.remaining, currentCurrency);
    document.getElementById('budget-daily-limit').textContent = `${formatCurrency(data.dailySafeSpend, currentCurrency)}/day`;

    const healthEl = document.getElementById('budget-health-score');
    healthEl.textContent = `${data.healthScore}/100`;
    healthEl.style.color =
      data.healthScore >= 70 ? 'var(--spendy-success)' : data.healthScore >= 40 ? 'var(--spendy-warning)' : 'var(--spendy-danger)';

    recPanel.innerHTML = (data.recommendations || [])
      .map((r) => `<div class="recommendation-item">${escapeHtml(r)}</div>`)
      .join('') || `<p class="empty-state u-muted">No recommendations yet — check back after a few more transactions.</p>`;

    if (forceRefresh) toast.success('Budget recommendations refreshed.');
  } catch (err) {
    console.error('[Spendy] Failed to load budget recommendations:', err.message);
    toast.error(err.message || 'Could not load budget recommendations.');
    recPanel.innerHTML = `<p class="empty-state u-muted">Something went wrong loading recommendations.</p>`;
  }
}

function renderRing(percent) {
  const ring = document.getElementById('budget-ring-progress');
  const label = document.getElementById('budget-ring-percent');
  if (!ring || !label) return;
  const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * Math.min(percent, 100)) / 100;
  ring.style.transition = 'stroke-dashoffset 0.6s ease';
  ring.setAttribute('stroke-dashoffset', String(offset));
  label.textContent = `${Math.round(percent)}%`;
}
