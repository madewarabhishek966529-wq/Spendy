// ============================================================================
// Spendy — Analytics Page Entry Script (Phase 5)
// Five Chart.js instances: Income vs Expense, Category Breakdown (pie),
// Spending Over Time, Savings Trend, and Budget Progress — all backed by the
// get_period_series / get_category_totals / get_budget_history RPCs
// (migration 003). Charts rebuild on range change, on Realtime transaction
// changes (debounced), and restyle in place on theme toggle.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { toast } from '../components/toast.js';
import { subscribeToTransactions } from '../services/transactionService.js';
import {
  fetchPeriodSeries,
  fetchCategoryTotals,
  fetchBudgetHistory,
} from '../services/analyticsService.js';
import { formatCurrency, formatCurrencyCompact } from '../utils/formatters.js';
import { getChartTheme, CATEGORY_COLORS, baseOptions } from '../utils/chartTheme.js';

applyStoredTheme();

const user = await requireAuth();
if (user) {
  mountShell({ active: 'analytics', title: 'Analytics', user });
  init(user.id);
}

/** Chart.js is loaded lazily (only on this page) from CDN as an ES module,
 *  same pattern as pdfExport.js — never costs anything elsewhere. */
let chartJsPromise = null;
function loadChartJs() {
  if (!chartJsPromise) {
    chartJsPromise = import('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm').then((mod) => mod.Chart);
  }
  return chartJsPromise;
}

const charts = {}; // id -> Chart instance, so re-renders destroy the old one first
let currentGranularity = 'month';
let currentUserId = null;

async function init(userId) {
  currentUserId = userId;

  const select = document.getElementById('range-select');
  select?.addEventListener('change', () => {
    currentGranularity = select.value;
    renderAll();
  });

  window.addEventListener('spendy:theme-change', () => renderAll());

  let refreshTimer = null;
  subscribeToTransactions(userId, () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => renderAll(), 400);
  });

  await renderAll();
}

async function renderAll() {
  const Chart = await loadChartJs();

  try {
    const [series, categories, history] = await Promise.all([
      fetchPeriodSeries(currentUserId, currentGranularity),
      fetchCategoryTotals(currentUserId, currentGranularity),
      fetchBudgetHistory(currentUserId, 6),
    ]);

    renderIncomeVsExpense(Chart, series);
    renderSpendingTrend(Chart, series);
    renderCategoryPie(Chart, categories);
    renderSavingsTrend(Chart, history);
    renderBudgetProgress(Chart, history);
  } catch (err) {
    console.error('[Spendy] Analytics render failed:', err.message);
    toast.error('Could not load analytics data.');
  }
}

function formatBucketLabel(bucket) {
  const d = new Date(`${bucket}T00:00:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  switch (currentGranularity) {
    case 'day':
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    case 'week':
      return `Wk of ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
    case 'year':
      return d.toLocaleDateString('en-IN', { year: 'numeric' });
    case 'month':
    default:
      return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }
}

function formatMonthLabel(monthDate) {
  const d = new Date(`${monthDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return monthDate;
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function destroy(id) {
  charts[id]?.destroy();
  delete charts[id];
}

function showEmptyState(canvasId, message) {
  destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  const wrap = canvas?.closest('.chart-canvas-wrap');
  if (!wrap) return;
  canvas.style.display = 'none';
  let empty = wrap.querySelector('.chart-placeholder');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'chart-placeholder';
    wrap.appendChild(empty);
  }
  empty.textContent = message;
  empty.style.display = 'flex';
}

function hideEmptyState(canvasId) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas?.closest('.chart-canvas-wrap');
  canvas.style.display = 'block';
  wrap?.querySelector('.chart-placeholder')?.remove();
}

function renderIncomeVsExpense(Chart, series) {
  const id = 'chart-income-vs-expense';
  if (!series.length) return showEmptyState(id, 'No transactions in this range yet.');
  hideEmptyState(id);

  const theme = getChartTheme();
  const labels = series.map((row) => formatBucketLabel(row.bucket));

  destroy(id);
  charts[id] = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income', data: series.map((r) => Number(r.income)), backgroundColor: theme.primary, borderRadius: 6 },
        { label: 'Expense', data: series.map((r) => Number(r.expense)), backgroundColor: theme.danger, borderRadius: 6 },
      ],
    },
    options: baseOptions(theme, {
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.textMuted, font: { family: theme.fontBody } } },
        y: {
          grid: { color: theme.gridLine },
          ticks: {
            color: theme.textMuted,
            font: { family: theme.fontBody },
            callback: (v) => formatCurrencyCompact(v),
          },
        },
      },
    }),
  });
}

function renderSpendingTrend(Chart, series) {
  const id = 'chart-spending-trend';
  if (!series.length) return showEmptyState(id, 'No expenses in this range yet.');
  hideEmptyState(id);

  const theme = getChartTheme();
  const labels = series.map((row) => formatBucketLabel(row.bucket));

  destroy(id);
  charts[id] = new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Expense',
          data: series.map((r) => Number(r.expense)),
          borderColor: theme.danger,
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
      ],
    },
    options: baseOptions(theme, {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.textMuted, font: { family: theme.fontBody } } },
        y: {
          grid: { color: theme.gridLine },
          ticks: {
            color: theme.textMuted,
            font: { family: theme.fontBody },
            callback: (v) => formatCurrencyCompact(v),
          },
        },
      },
    }),
  });
}

function renderCategoryPie(Chart, categories) {
  const id = 'chart-category-pie';
  if (!categories.length) return showEmptyState(id, 'No expenses in this range yet.');
  hideEmptyState(id);

  const theme = getChartTheme();

  destroy(id);
  charts[id] = new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: {
      labels: categories.map((c) => c.category),
      datasets: [
        {
          data: categories.map((c) => Number(c.total)),
          backgroundColor: categories.map((c) => CATEGORY_COLORS[c.category] ?? theme.secondary),
          borderColor: 'transparent',
          hoverOffset: 6,
        },
      ],
    },
    options: baseOptions(theme, {
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { color: theme.textMuted, font: { family: theme.fontBody }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: theme.textPrimary,
          callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` },
        },
      },
    }),
  });
}

function renderSavingsTrend(Chart, history) {
  const id = 'chart-savings-trend';
  if (!history.length) return showEmptyState(id, 'Add transactions to see your savings trend.');
  hideEmptyState(id);

  const theme = getChartTheme();
  const labels = history.map((row) => formatMonthLabel(row.month));
  const savings = history.map((row) => Number(row.income) - Number(row.expense));

  destroy(id);
  charts[id] = new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Savings',
          data: savings,
          borderColor: theme.secondary,
          backgroundColor: 'rgba(79, 70, 229, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: savings.map((v) => (v >= 0 ? theme.primary : theme.danger)),
        },
      ],
    },
    options: baseOptions(theme, {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: theme.textMuted, font: { family: theme.fontBody } } },
        y: {
          grid: { color: theme.gridLine },
          ticks: {
            color: theme.textMuted,
            font: { family: theme.fontBody },
            callback: (v) => formatCurrencyCompact(v),
          },
        },
      },
    }),
  });
}

function renderBudgetProgress(Chart, history) {
  const id = 'chart-budget-progress';
  const withBudget = history.filter((row) => Number(row.budget_amount) > 0);
  if (!withBudget.length) return showEmptyState(id, 'Set a monthly budget to see your progress here.');
  hideEmptyState(id);

  const theme = getChartTheme();
  const labels = history.map((row) => formatMonthLabel(row.month));

  destroy(id);
  charts[id] = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Budget', data: history.map((r) => Number(r.budget_amount)), backgroundColor: theme.gridLine, borderRadius: 6 },
        { label: 'Spent', data: history.map((r) => Number(r.expense)), backgroundColor: theme.accent, borderRadius: 6 },
      ],
    },
    options: baseOptions(theme, {
      indexAxis: 'y',
      scales: {
        x: {
          grid: { color: theme.gridLine },
          ticks: {
            color: theme.textMuted,
            font: { family: theme.fontBody },
            callback: (v) => formatCurrencyCompact(v),
          },
        },
        y: { grid: { display: false }, ticks: { color: theme.textMuted, font: { family: theme.fontBody } } },
      },
    }),
  });
}
