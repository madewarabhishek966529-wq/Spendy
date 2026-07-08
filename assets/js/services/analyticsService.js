// ============================================================================
// Spendy — Analytics Service
// Thin wrapper around the get_period_series / get_category_totals /
// get_budget_history RPCs (migration 003). Each function picks a sensible
// default date range for its granularity so the Analytics page can call
// these directly without repeating date math.
// ============================================================================

import { supabase } from './supabaseClient.js';

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/** Default lookback window for each period-series granularity. */
const RANGE_DAYS = {
  day: 30,     // last 30 days, bucketed daily
  week: 84,    // last 12 weeks, bucketed weekly
  month: 365,  // last 12 months, bucketed monthly
  year: 1825,  // last 5 years, bucketed yearly
};

/**
 * Fetch income/expense totals bucketed by the given granularity.
 * @param {'day'|'week'|'month'|'year'} granularity
 */
export async function fetchPeriodSeries(userId, granularity = 'month') {
  const days = RANGE_DAYS[granularity] ?? RANGE_DAYS.month;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase.rpc('get_period_series', {
    p_user_id: userId,
    p_granularity: granularity,
    p_from: toISODate(from),
    p_to: toISODate(to),
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch expense totals by category for the given range. Defaults to the
 * range implied by `granularity` so the pie chart stays in sync with the
 * period selector.
 */
export async function fetchCategoryTotals(userId, granularity = 'month') {
  const days = RANGE_DAYS[granularity] ?? RANGE_DAYS.month;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase.rpc('get_category_totals', {
    p_user_id: userId,
    p_from: toISODate(from),
    p_to: toISODate(to),
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch the last N months of budget vs. income/expense, used for both the
 * Savings Trend line and the Budget Progress bar chart.
 */
export async function fetchBudgetHistory(userId, months = 6) {
  const { data, error } = await supabase.rpc('get_budget_history', {
    p_user_id: userId,
    p_months: months,
  });
  if (error) throw error;
  return data ?? [];
}
