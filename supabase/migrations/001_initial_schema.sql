-- ============================================================================
-- Spendy — Initial Schema (Phase 1)
-- Tables: profiles, transactions, budgets, receipts, ai_reports
-- Includes: PK/FK constraints, indexes, check constraints, RLS policies,
-- triggers for updated_at and auto-profile creation on signup.
-- ============================================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type transaction_type as enum ('income', 'expense');

create type expense_category as enum (
  'Food', 'Transport', 'Shopping', 'Education', 'Medical',
  'Entertainment', 'Bills', 'Rent', 'Travel', 'Other'
);

create type income_source as enum (
  'Pocket Money', 'Salary', 'Scholarship', 'Freelancing', 'Gift', 'Other'
);

-- ----------------------------------------------------------------------------
-- PROFILES
-- One row per authenticated user, keyed to auth.users.id
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  avatar_url text,
  currency text not null default 'INR',
  monthly_budget numeric(12,2) default 0 check (monthly_budget >= 0),
  theme_preference text not null default 'light' check (theme_preference in ('light', 'dark')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_email on public.profiles(email);

-- ----------------------------------------------------------------------------
-- TRANSACTIONS (income + expenses, unified for simpler queries/aggregation)
-- ----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type transaction_type not null,
  title text not null check (char_length(trim(title)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  category expense_category,          -- required for type='expense', null for income
  source income_source,               -- required for type='income', null for expense
  description text,
  transaction_date date not null default current_date,
  receipt_id uuid,                    -- nullable FK, set after receipts row exists
  ai_categorized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_type_fields check (
    (type = 'expense' and category is not null and source is null) or
    (type = 'income'  and source   is not null and category is null)
  )
);

create index idx_transactions_user_id on public.transactions(user_id);
create index idx_transactions_user_date on public.transactions(user_id, transaction_date desc);
create index idx_transactions_user_type on public.transactions(user_id, type);
create index idx_transactions_category on public.transactions(category) where category is not null;

-- ----------------------------------------------------------------------------
-- RECEIPTS (uploaded images + AI extraction results)
-- ----------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  storage_path text not null,          -- path in Supabase Storage bucket 'receipts'
  merchant_name text,
  extracted_amount numeric(12,2),
  extracted_date date,
  purchased_items jsonb,               -- array of {name, price, quantity}
  tax_amount numeric(12,2),
  payment_method text,
  suggested_category expense_category,
  confidence_score numeric(3,2) check (confidence_score between 0 and 1),
  ai_raw_response jsonb,               -- full GPT-5 vision response for audit/debug
  status text not null default 'pending' check (status in ('pending', 'processed', 'needs_review', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_receipts_user_id on public.receipts(user_id);
create index idx_receipts_status on public.receipts(status);

-- Now that receipts exists, wire the FK from transactions
alter table public.transactions
  add constraint fk_transactions_receipt
  foreign key (receipt_id) references public.receipts(id) on delete set null;

-- ----------------------------------------------------------------------------
-- BUDGETS (monthly budget targets, one active row per user per month)
-- ----------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,                 -- normalized to first of month, e.g. 2026-07-01
  budget_amount numeric(12,2) not null check (budget_amount > 0),
  alert_threshold_percent int not null default 80 check (alert_threshold_percent between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create index idx_budgets_user_id on public.budgets(user_id);

-- ----------------------------------------------------------------------------
-- AI_REPORTS (cached insight generations so we don't re-call GPT-5 every load)
-- ----------------------------------------------------------------------------
create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly', 'budget_recommendation')),
  period_start date not null,
  period_end date not null,
  summary text not null,
  insights jsonb not null default '[]'::jsonb,   -- array of insight strings/objects
  metrics jsonb not null default '{}'::jsonb,    -- structured numbers behind the insights
  generated_at timestamptz not null default now(),
  constraint chk_period check (period_end >= period_start)
);

create index idx_ai_reports_user_id on public.ai_reports(user_id);
create index idx_ai_reports_user_period on public.ai_reports(user_id, report_type, period_start desc);

-- ----------------------------------------------------------------------------
-- updated_at TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger trg_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- AUTO-CREATE PROFILE ON SIGNUP (Google OAuth via Supabase Auth)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- Every table: users can only ever read/write rows where user_id = auth.uid()
-- (profiles uses id = auth.uid() since id IS the user id)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.receipts enable row level security;
alter table public.budgets enable row level security;
alter table public.ai_reports enable row level security;

-- PROFILES
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No insert policy needed for profiles: the handle_new_user trigger runs as
-- security definer and inserts on the user's behalf during signup.
-- No delete policy: profile deletion cascades from auth.users deletion only.

-- TRANSACTIONS
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- RECEIPTS
create policy "receipts_select_own" on public.receipts
  for select using (auth.uid() = user_id);

create policy "receipts_insert_own" on public.receipts
  for insert with check (auth.uid() = user_id);

create policy "receipts_update_own" on public.receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "receipts_delete_own" on public.receipts
  for delete using (auth.uid() = user_id);

-- BUDGETS
create policy "budgets_select_own" on public.budgets
  for select using (auth.uid() = user_id);

create policy "budgets_insert_own" on public.budgets
  for insert with check (auth.uid() = user_id);

create policy "budgets_update_own" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "budgets_delete_own" on public.budgets
  for delete using (auth.uid() = user_id);

-- AI_REPORTS (read-only from client; writes happen via Edge Function w/ service role)
create policy "ai_reports_select_own" on public.ai_reports
  for select using (auth.uid() = user_id);

-- ============================================================================
-- STORAGE BUCKET for receipt images (private, per-user folder access)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipt_images_select_own"
  on storage.objects for select
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipt_images_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipt_images_delete_own"
  on storage.objects for delete
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- HELPFUL VIEWS for dashboard aggregation (respect RLS of underlying tables)
-- ============================================================================
create or replace view public.v_daily_summary
with (security_invoker = true) as
select
  user_id,
  transaction_date,
  sum(amount) filter (where type = 'income')  as total_income,
  sum(amount) filter (where type = 'expense') as total_expense
from public.transactions
group by user_id, transaction_date;

create or replace view public.v_monthly_summary
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  sum(amount) filter (where type = 'income')  as total_income,
  sum(amount) filter (where type = 'expense') as total_expense
from public.transactions
group by user_id, date_trunc('month', transaction_date);
