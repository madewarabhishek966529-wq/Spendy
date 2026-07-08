// ============================================================================
// Spendy — Dashboard Entry Script (Phase 3 + Phase 4 FAB wiring)
// Wires the stat grid, recent-transactions panel, and budget panel to real
// Supabase queries, keeps them live via Realtime, and opens the shared
// add-transaction modal (built in Phase 4) from the floating action button.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { supabase } from '../services/supabaseClient.js';
import { toast } from '../components/toast.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import {
  fetchDashboardSummary,
  fetchRecentTransactions,
  subscribeToTransactions,
} from '../services/transactionService.js';
import {
  fetchCurrentBudget,
  computeBudgetStatus,
} from '../services/budgetService.js';
import { formatCurrency, formatRelativeDate } from '../utils/formatters.js';
import { openTransactionModal } from '../components/transactionModal.js';
import { openVoiceEntry } from '../components/voiceEntry.js';
import { icons } from '../utils/icons.js';
import { fetchAIInsights } from '../services/aiService.js';
import { escapeHtml } from '../utils/sanitize.js';

applyStoredTheme();

let currentCurrency = 'INR';

const user = await requireAuth();
if (user) {
  mountShell({ active: 'dashboard', title: 'Dashboard', user });
  wireFab();

  try {
    currentCurrency = (await loadProfile(user.id))?.currency ?? 'INR';
  } catch (err) {
    console.error('[Spendy] Failed to load profile:', err.message);
    toast.error('Could not load your profile.');
  }

  await refreshDashboard(user.id, currentCurrency);
  loadInsightsPreview(); // fire-and-forget: don't block the main dashboard render

  // Live updates: any insert/update/delete on this user's transactions
  // (from this tab, another tab, or another device) triggers a refresh.
  // Debounced so a burst of changes doesn't hammer the RPC.
  let refreshTimer = null;
  subscribeToTransactions(user.id, () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(user.id, currentCurrency), 300);
  });
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, monthly_budget, currency, created_at')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

async function refreshDashboard(userId, currency) {
  try {
    const [summary, recent, budgetRow] = await Promise.all([
      fetchDashboardSummary(userId),
      fetchRecentTransactions(userId, 8),
      fetchCurrentBudget(userId),
    ]);

    renderStatGrid(summary, budgetRow, currency);
    renderRecentTransactions(recent, currency);
    renderBudgetStatus(computeBudgetStatus(budgetRow, summary.monthly_expense), currency);
  } catch (err) {
    console.error('[Spendy] Dashboard refresh failed:', err.message);
    toast.error('Could not load your dashboard data.');
  }
}

function renderStatGrid(summary, budgetRow, currency) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrency(value, currency);
  };

  set('stat-balance', summary.balance);
  set('stat-today-income', summary.today_income);
  set('stat-today-expense', summary.today_expense);
  set('stat-weekly-expense', summary.weekly_expense);
  set('stat-monthly-income', summary.monthly_income);
  set('stat-monthly-expense', summary.monthly_expense);
  set('stat-savings', summary.savings);

  const remainingEl = document.getElementById('stat-remaining-budget');
  if (remainingEl) {
    if (budgetRow) {
      const remaining = Math.max(
        Number(budgetRow.budget_amount) - Number(summary.monthly_expense),
        0
      );
      remainingEl.textContent = formatCurrency(remaining, currency);
    } else {
      remainingEl.textContent = 'No budget set';
    }
  }
}

function renderRecentTransactions(transactions, currency) {
  const container = document.getElementById('recent-transactions-list');
  if (!container) return;

  if (!transactions.length) {
    container.innerHTML =
      '<p class="empty-state u-muted">No transactions yet — add your first one to see it here.</p>';
    return;
  }

  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'transaction-list';

  for (const tx of transactions) {
    const row = document.createElement('div');
    row.className = 'transaction-row';

    const label = tx.type === 'income' ? tx.source : tx.category;
    const sign = tx.type === 'income' ? '+' : '−';
    const amountClass =
      tx.type === 'income' ? 'transaction-row__amount--success' : 'transaction-row__amount--danger';

    row.innerHTML = `
      <div class="transaction-row__info">
        <span class="transaction-row__title"></span>
        <span class="transaction-row__meta u-muted"></span>
      </div>
      <span class="transaction-row__amount ${amountClass}"></span>
    `;

    row.querySelector('.transaction-row__title').textContent = tx.title;
    row.querySelector('.transaction-row__meta').textContent =
      `${label ?? 'Other'} · ${formatRelativeDate(tx.transaction_date)}`;
    row.querySelector('.transaction-row__amount').textContent =
      `${sign} ${formatCurrency(tx.amount, currency)}`;

    list.appendChild(row);
  }

  container.appendChild(list);
}

function renderBudgetStatus(status, currency) {
  const container = document.getElementById('budget-status');
  if (!container) return;

  if (!status) {
    container.innerHTML =
      '<p class="empty-state u-muted">Set a monthly budget to track your progress here.</p>';
    return;
  }

  const barClass = status.isOverBudget
    ? 'budget-bar__fill--danger'
    : status.isNearThreshold
      ? 'budget-bar__fill--warning'
      : '';

  container.innerHTML = `
    <div class="budget-summary">
      <span class="budget-summary__spent"></span>
      <span class="budget-summary__total u-muted"></span>
    </div>
    <div class="budget-bar">
      <div class="budget-bar__fill ${barClass}" style="width:${status.percentUsed.toFixed(1)}%"></div>
    </div>
    <p class="budget-note u-muted"></p>
  `;

  container.querySelector('.budget-summary__spent').textContent = formatCurrency(status.spent, currency);
  container.querySelector('.budget-summary__total').textContent =
    ` of ${formatCurrency(status.budgetAmount, currency)}`;

  const note = container.querySelector('.budget-note');
  if (status.isOverBudget) {
    note.textContent = `You're ${formatCurrency(status.spent - status.budgetAmount, currency)} over this month's budget.`;
  } else {
    note.textContent = `You can safely spend ${formatCurrency(status.dailySafeSpend, currency)}/day for the next ${status.daysLeft} days.`;
  }
}

function wireFab() {
  const voiceFab = document.getElementById('fab-voice');
  if (voiceFab) voiceFab.innerHTML = icons.mic;

  document.getElementById('fab-add')?.addEventListener('click', () => {
    openTransactionModal({
      userId: user.id,
      onSaved: () => refreshDashboard(user.id, currentCurrency),
    });
  });

  voiceFab?.addEventListener('click', () => {
    openVoiceEntry({
      userId: user.id,
      onSaved: () => refreshDashboard(user.id, currentCurrency),
    });
  });
}

async function loadInsightsPreview() {
  const container = document.getElementById('ai-insights-preview');
  if (!container) return;
  try {
    const { summary, insights } = await fetchAIInsights(false);
    if (!insights || insights.length === 0) {
      container.innerHTML = `<p class="empty-state u-muted">${escapeHtml(summary)}</p>`;
      return;
    }
    container.innerHTML = `
      <p class="u-muted" style="margin-bottom:var(--sp-3);">${escapeHtml(summary)}</p>
      <ul class="insight-preview-list">
        ${insights
          .slice(0, 3)
          .map((i) => `<li><strong>${escapeHtml(i.title)}</strong> — ${escapeHtml(i.detail)}</li>`)
          .join('')}
      </ul>
    `;
  } catch (err) {
    console.error('[Spendy] Failed to load insights preview:', err.message);
    container.innerHTML = `<p class="empty-state u-muted">Insights will appear here once available.</p>`;
  }
}
