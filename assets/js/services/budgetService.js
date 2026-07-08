// ============================================================================
// Spendy — Budget Service
// Fetches the active month's budget row and derives the progress figures
// the dashboard's Budget Status panel needs (spent, remaining, % used,
// daily safe-to-spend, days left in month).
// ============================================================================

import { supabase } from './supabaseClient.js';

function firstOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function daysRemainingInMonth(date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - date.getDate() + 1, 1);
}

/**
 * Fetch this user's budget row for the current month, or null if they
 * haven't set one yet.
 */
export async function fetchCurrentBudget(userId) {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, budget_amount, alert_threshold_percent, month')
    .eq('user_id', userId)
    .eq('month', firstOfMonth())
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Combine the current budget row with this month's expense total (already
 * available from the dashboard summary RPC) into the derived stats the
 * Budget Status panel displays.
 */
export function computeBudgetStatus(budgetRow, monthlyExpense) {
  if (!budgetRow) return null;

  const budgetAmount = Number(budgetRow.budget_amount) || 0;
  const spent = Number(monthlyExpense) || 0;
  const remaining = Math.max(budgetAmount - spent, 0);
  const percentUsed = budgetAmount > 0 ? Math.min((spent / budgetAmount) * 100, 100) : 0;
  const daysLeft = daysRemainingInMonth();
  const dailySafeSpend = remaining / daysLeft;
  const isOverBudget = spent > budgetAmount;
  const isNearThreshold = percentUsed >= (budgetRow.alert_threshold_percent ?? 80);

  return {
    budgetAmount,
    spent,
    remaining,
    percentUsed,
    daysLeft,
    dailySafeSpend,
    isOverBudget,
    isNearThreshold,
  };
}

/**
 * Create or update this user's budget for the current month (upsert on the
 * unique (user_id, month) constraint from the Phase 1 schema).
 */
export async function setMonthlyBudget(userId, budgetAmount, alertThresholdPercent = 80) {
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: userId,
        month: firstOfMonth(),
        budget_amount: budgetAmount,
        alert_threshold_percent: alertThresholdPercent,
      },
      { onConflict: 'user_id,month' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
