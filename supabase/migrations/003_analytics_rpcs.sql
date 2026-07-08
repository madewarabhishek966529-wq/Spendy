-- ============================================================================
-- Spendy — Analytics RPCs (Phase 5)
-- Three aggregate functions powering the Analytics page's Chart.js views.
-- All run security invoker with an explicit auth.uid() check so RLS on
-- public.transactions / public.budgets is the real backstop, not this check
-- alone — belt and suspenders, matching the pattern from migration 002.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_period_series
-- Buckets income/expense totals by day, week, month, or year across a date
-- range. Powers "Income vs Expense" and "Spending Over Time".
-- ----------------------------------------------------------------------------
create or replace function public.get_period_series(
  p_user_id uuid,
  p_granularity text,   -- 'day' | 'week' | 'month' | 'year'
  p_from date,
  p_to date
)
returns table (bucket date, income numeric, expense numeric)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized to read this user''s analytics';
  end if;
  if p_granularity not in ('day', 'week', 'month', 'year') then
    raise exception 'Invalid granularity: %', p_granularity;
  end if;

  return query
  select
    date_trunc(p_granularity, t.transaction_date)::date as bucket,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)  as income,
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
  from public.transactions t
  where t.user_id = p_user_id
    and t.transaction_date between p_from and p_to
  group by bucket
  order by bucket;
end;
$$;

comment on function public.get_period_series(uuid, text, date, date) is
  'Income/expense totals bucketed by day/week/month/year for the Analytics charts.';

-- ----------------------------------------------------------------------------
-- get_category_totals
-- Expense totals per category within a date range. Powers the category
-- breakdown pie chart.
-- ----------------------------------------------------------------------------
create or replace function public.get_category_totals(
  p_user_id uuid,
  p_from date,
  p_to date
)
returns table (category expense_category, total numeric)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized to read this user''s analytics';
  end if;

  return query
  select t.category, sum(t.amount) as total
  from public.transactions t
  where t.user_id = p_user_id
    and t.type = 'expense'
    and t.category is not null
    and t.transaction_date between p_from and p_to
  group by t.category
  order by total desc;
end;
$$;

comment on function public.get_category_totals(uuid, date, date) is
  'Expense totals grouped by category within a date range, for the category pie chart.';

-- ----------------------------------------------------------------------------
-- get_budget_history
-- Last N months of budget vs actual spend, for the Savings Trend and Budget
-- Progress charts. Uses generate_series so months with no budget row still
-- appear (with budget_amount = 0), keeping the chart's x-axis continuous.
-- ----------------------------------------------------------------------------
create or replace function public.get_budget_history(
  p_user_id uuid,
  p_months int default 6
)
returns table (month date, budget_amount numeric, income numeric, expense numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start date := date_trunc('month', current_date)::date - ((p_months - 1) || ' months')::interval;
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized to read this user''s analytics';
  end if;

  return query
  select
    m.month::date,
    coalesce(b.budget_amount, 0) as budget_amount,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)  as income,
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expense
  from generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month') as m(month)
  left join public.budgets b
    on b.user_id = p_user_id and b.month = m.month::date
  left join public.transactions t
    on t.user_id = p_user_id
   and date_trunc('month', t.transaction_date)::date = m.month::date
  group by m.month, b.budget_amount
  order by m.month;
end;
$$;

comment on function public.get_budget_history(uuid, int) is
  'Per-month budget vs income/expense for the last N months, for Savings Trend and Budget Progress charts.';
