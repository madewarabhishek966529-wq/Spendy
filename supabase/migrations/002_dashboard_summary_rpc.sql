-- ============================================================================
-- Spendy — Dashboard Summary RPC (Phase 3)
-- Returns every number the dashboard stat grid needs in one round-trip
-- instead of 6-8 separate client-side aggregate queries. Runs as the calling
-- user (security invoker), so RLS on public.transactions still applies —
-- this function can never see another user's rows.
-- ============================================================================

create or replace function public.get_dashboard_summary(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := current_date;
  v_week_start date := date_trunc('week', current_date)::date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_result jsonb;
begin
  if p_user_id <> auth.uid() then
    raise exception 'Not authorized to read this user''s summary';
  end if;

  select jsonb_build_object(
    'balance', coalesce(sum(amount) filter (where type = 'income'), 0)
             - coalesce(sum(amount) filter (where type = 'expense'), 0),
    'today_income', coalesce(sum(amount) filter (
        where type = 'income' and transaction_date = v_today), 0),
    'today_expense', coalesce(sum(amount) filter (
        where type = 'expense' and transaction_date = v_today), 0),
    'weekly_expense', coalesce(sum(amount) filter (
        where type = 'expense' and transaction_date >= v_week_start), 0),
    'monthly_income', coalesce(sum(amount) filter (
        where type = 'income' and transaction_date >= v_month_start), 0),
    'monthly_expense', coalesce(sum(amount) filter (
        where type = 'expense' and transaction_date >= v_month_start), 0)
  )
  into v_result
  from public.transactions
  where user_id = p_user_id;

  -- savings = monthly income minus monthly expense, floored at 0 for display
  v_result := v_result || jsonb_build_object(
    'savings',
    greatest(
      (v_result->>'monthly_income')::numeric - (v_result->>'monthly_expense')::numeric,
      0
    )
  );

  return v_result;
end;
$$;

comment on function public.get_dashboard_summary(uuid) is
  'Aggregated balance/income/expense/savings figures for the dashboard stat grid. Caller must pass their own auth.uid().';
