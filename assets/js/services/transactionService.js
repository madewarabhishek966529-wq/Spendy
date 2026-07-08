// ============================================================================
// Spendy — Transaction Service
// Query + Realtime layer for the `transactions` table. Every function here
// is scoped to the calling user (RLS enforces it server-side too, but we
// still pass user_id explicitly for clear, indexable queries).
// ============================================================================

import { supabase } from './supabaseClient.js';

/**
 * Fetch the aggregated dashboard figures (balance, today/week/month
 * income+expense, savings) in a single round-trip via the get_dashboard_summary
 * RPC defined in migration 002.
 */
export async function fetchDashboardSummary(userId) {
  const { data, error } = await supabase.rpc('get_dashboard_summary', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

/**
 * Fetch the most recent N transactions for the recent-transactions panel.
 */
export async function fetchRecentTransactions(userId, limit = 8) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, title, amount, category, source, transaction_date, description')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Subscribe to Realtime changes on this user's transactions so the
 * dashboard (and any other page) can react instantly to inserts/updates/
 * deletes made from this device or any other signed-in device.
 * Returns an unsubscribe function.
 */
export function subscribeToTransactions(userId, onChange) {
  const channel = supabase
    .channel(`transactions-user-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onChange(payload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Insert a new transaction (income or expense). Used by the add-transaction
 * flow (Phase 4) but placed here now so the dashboard FAB and any quick-add
 * surface can already call into a real, working data layer.
 */
export async function createTransaction(transaction) {
  const { data, error } = await supabase
    .from('transactions')
    .insert(transaction)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update an existing transaction. `id` is not part of the patch payload. */
export async function updateTransaction(id, patch) {
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

const SORTABLE_COLUMNS = new Set(['transaction_date', 'title', 'amount']);

/**
 * Paginated, searchable, filterable, sortable query for the Transactions
 * table. Returns { rows, count } where count is the total matching rows
 * (for pagination controls), independent of the page slice returned.
 *
 * @param {Object} opts
 * @param {number} opts.page - 1-indexed page number
 * @param {number} opts.pageSize
 * @param {string} [opts.search] - matches against title (case-insensitive)
 * @param {'all'|'income'|'expense'} [opts.type]
 * @param {string} [opts.category] - 'all' or one of the expense_category enum values
 * @param {string} [opts.sortColumn] - one of transaction_date | title | amount
 * @param {'asc'|'desc'} [opts.sortDirection]
 */
export async function fetchTransactionsPage(userId, opts = {}) {
  const {
    page = 1,
    pageSize = 15,
    search = '',
    type = 'all',
    category = 'all',
    sortColumn = 'transaction_date',
    sortDirection = 'desc',
  } = opts;

  const column = SORTABLE_COLUMNS.has(sortColumn) ? sortColumn : 'transaction_date';
  const ascending = sortDirection === 'asc';
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('transactions')
    .select(
      'id, type, title, amount, category, source, description, transaction_date, receipt_id',
      { count: 'exact' }
    )
    .eq('user_id', userId);

  if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);
  if (type !== 'all') query = query.eq('type', type);
  if (category !== 'all') query = query.eq('category', category);

  query = query
    .order(column, { ascending })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

/**
 * Fetch every transaction matching the current search/filter (no pagination)
 * for CSV/PDF export. Capped at 5,000 rows as a sane safety limit.
 */
export async function fetchTransactionsForExport(userId, { search = '', type = 'all', category = 'all' } = {}) {
  let query = supabase
    .from('transactions')
    .select('type, title, amount, category, source, description, transaction_date')
    .eq('user_id', userId);

  if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);
  if (type !== 'all') query = query.eq('type', type);
  if (category !== 'all') query = query.eq('category', category);

  query = query.order('transaction_date', { ascending: false }).limit(5000);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
