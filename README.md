# Spendy — Phases 1–6: Database, Auth, UI, Live Data, Analytics & AI Features

> **New here?** See [`SETUP.md`](./SETUP.md) for the condensed setup-and-run
> steps. This README covers the full feature walkthrough and per-phase
> verification checklist.

Phase 1 built the foundation: the PostgreSQL schema (with full Row Level
Security) and a working Google OAuth login → protected dashboard → logout
loop. Phase 2 builds the full app shell and every page in the spec, wired
to real navigation and auth. Phases 3–4 wired the Dashboard and
Transactions pages to live Supabase data. Phase 5 brings the Analytics
page to life with five Chart.js visualizations. Phase 6 adds the AI
layer — five OpenAI-backed Supabase Edge Functions (receipt scanning,
auto-categorization, voice entry, financial insights, budget
recommendations) wired into the Transactions, Budget, and AI Insights
pages — ready for Phase 7's testing and polish pass.

## What's included

**Phase 1 — Database & Auth**
- `supabase/migrations/001_initial_schema.sql` — `profiles`, `transactions`,
  `receipts`, `budgets`, `ai_reports` tables with indexes, constraints, RLS
  policies on every table, a private `receipts` storage bucket with
  per-user folder policies, and two summary views for dashboard queries.
- `assets/js/services/supabaseClient.js` — the one Supabase client instance.
- `assets/js/services/authService.js` — Google sign-in, session restore,
  logout, and an auth-state pub/sub other pages subscribe to.
- `assets/js/utils/routeGuard.js` — `requireAuth()` protects pages;
  `redirectIfAuthed()` keeps logged-in users off the login screen.

**Phase 2 — UI Layout**
- `index.html` — the marketing landing page (`assets/css/landing.css`,
  `assets/js/pages/landing.js`).
- `pages/login.html` — the dedicated login page (`assets/css/login.css`,
  `assets/js/pages/login.js`).
- `assets/js/utils/shell.js` + `assets/css/shell.css` — the shared app
  shell (sidebar nav, topbar with theme toggle + user menu, mobile
  collapse) every authenticated page mounts via `mountShell()`.
- `assets/js/utils/icons.js` — the shared icon set.
- All remaining pages from the spec, each with the shell mounted and a
  structural placeholder ready for its data-wiring phase:
  `pages/dashboard.html`, `pages/transactions.html`,
  `pages/analytics.html`, `pages/budget.html`, `pages/ai-insights.html`,
  `pages/profile.html`, `pages/settings.html`.
- `assets/js/components/toast.js` — the toast system used across the app.
- `assets/css/tokens.css` + `base.css` — the design system (colors,
  type, glass cards, buttons) every page builds on.
- `assets/css/pages.css` — shared table/chart/card patterns for the
  content pages.

**Phase 6 — AI Features**
- `supabase/functions/_shared/` — `authClient.ts` (verifies the caller's
  JWT before any function touches data), `cors.ts`, `openai.ts` (the one
  place the OpenAI key is read, via `Deno.env`).
- `supabase/functions/categorize-expense/` — GPT-5 suggests a category as
  the user types an expense title.
- `supabase/functions/scan-receipt/` — GPT-5 Vision reads an uploaded
  receipt image and extracts merchant/amount/date/items/tax/payment
  method/category, writing the results back onto the `receipts` row.
- `supabase/functions/transcribe-voice/` — OpenAI Speech-to-Text
  transcribes a recorded clip, then GPT-5 extracts structured expense/
  income fields from the sentence (e.g. "I spent 250 on lunch today").
- `supabase/functions/generate-insights/` — computes real numbers from
  the user's transactions locally, then asks GPT-5 to phrase a summary +
  insight cards from those numbers (never lets the model do arithmetic),
  caching results in `ai_reports` for 6 hours.
- `supabase/functions/budget-recommendation/` — same pattern for the
  Budget page: deterministic health score + safe daily spend, GPT-5 only
  writes the recommendation sentences.
- `assets/js/services/aiService.js` — client wrapper around all five
  functions via `supabase.functions.invoke` (auto-attaches the session JWT).
- `assets/js/components/voiceEntry.js` — mic recording UI (MediaRecorder)
  that feeds `transcribe-voice` and opens a pre-filled transaction modal.
- `assets/js/components/transactionModal.js` — now debounce-suggests a
  category as you type a title, and immediately uploads + AI-scans a
  receipt photo the moment it's attached, filling the form for you to
  confirm (low-confidence scans are flagged instead of auto-filled).
- `assets/js/pages/ai-insights.js` and `assets/js/pages/budget.js` — fully
  wired to real AI output instead of "coming in Phase 6" toasts.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. In **SQL Editor**, paste and run
   `supabase/migrations/001_initial_schema.sql`.
3. In **Authentication → Providers**, enable **Google**.

## 2. Set up Google OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 Client ID (type: Web application).
2. Add this Authorized redirect URI (find your exact value in Supabase
   under Authentication → Providers → Google):
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client Secret into Supabase's Google provider
   settings and save.

## 3. Configure environment variables

```bash
cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_ANON_KEY from
# Supabase → Project Settings → API
npm run build:config
```

This rewrites the placeholders in `assets/js/utils/config.js` with your
real values. **Never** put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
here — those are server-only and belong in Supabase Edge Function secrets
(set up in the next step).

## 3.5. Deploy the AI Edge Functions (Phase 6)

Spendy's AI features (receipt scanning, auto-categorization, voice entry,
insights, budget recommendations) run as Supabase Edge Functions so the
OpenAI API key never reaches the browser.

```bash
npm install -g supabase   # one-time, or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>

# Run the analytics + dashboard RPC migrations too, if you haven't yet:
supabase db push

# Server-only secrets (never exposed to the client):
supabase secrets set OPENAI_API_KEY=sk-...
# Optional overrides — defaults are gpt-5 and gpt-4o-transcribe:
supabase secrets set OPENAI_CHAT_MODEL=gpt-5
supabase secrets set OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe

# Deploy each function:
supabase functions deploy categorize-expense
supabase functions deploy scan-receipt
supabase functions deploy transcribe-voice
supabase functions deploy generate-insights
supabase functions deploy budget-recommendation
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
automatically available to every deployed function — you don't need to
set those as secrets yourself. The client calls these via
`supabase.functions.invoke(...)` in `assets/js/services/aiService.js`,
which automatically attaches the signed-in user's session token; each
function verifies that token before touching any data (see
`supabase/functions/_shared/authClient.ts`).

## 4. Run locally

```bash
npm install --global serve   # one-time, or use any static file server
npm run dev
# open http://localhost:5500
```

Because this app uses native ES modules with no bundler, it must be served
over HTTP (not opened as a `file://` path) or `import` statements will fail.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in [vercel.com/new](https://vercel.com/new).
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under Project Settings →
   Environment Variables (Production + Preview).
4. Deploy — `vercel.json` already points the build command at
   `npm run vercel-build`, which injects those env vars into `config.js`
   before the static files are served.
5. Back in Supabase → Authentication → URL Configuration, add your
   Vercel domain to **Site URL** and **Redirect URLs** so the Google
   OAuth round-trip returns to the right place.

## Verifying Phase 1 works

1. Open the deployed (or local) site → you land on the Spendy login page.
2. Click **Continue with Google** → Google consent screen → redirected
   back to `/pages/dashboard.html`.
3. Refresh the dashboard — you stay logged in (session restore).
4. Check Supabase → Table Editor → `profiles` — a row was auto-created
   for your user via the `handle_new_user` trigger.
5. Click **Log out** → redirected to the login page; reopening the
   dashboard URL directly now bounces you back to login (route guard).

## Verifying Phase 2 works

1. Open `index.html` — the landing page renders with the hero, feature
   cards, and "Get Started" → `pages/login.html`.
2. Sign in with Google → lands on `pages/dashboard.html` with the full
   sidebar + topbar shell, stat card grid, and panel placeholders.
3. Click through every sidebar link (Transactions, Analytics, Budget,
   AI Insights, Profile, Settings) — each loads with the shell mounted,
   the correct link highlighted as active, and page-appropriate structure.
4. Toggle dark mode from the topbar — the whole shell and content
   area re-theme instantly and the preference persists on reload.
5. Narrow the browser below ~960px — the sidebar collapses behind the
   hamburger menu with a scrim overlay.
6. On the Settings page, toggle dark mode again and log out from there too.

## Verifying Phase 3 works

1. Run migrations `002_dashboard_summary_rpc.sql` and
   `003_analytics_rpcs.sql` after `001_initial_schema.sql`
   (Supabase Dashboard → SQL Editor, or `supabase db push` if you're using
   the CLI locally).
2. Sign in and open the dashboard — the eight stat cards populate from real
   data (all ₹0 for a brand-new account, since there are no transactions yet).
3. Insert a row directly in Supabase → Table Editor → `transactions` for
   your user (e.g. an expense dated today). Within ~300ms the dashboard
   updates itself with no page refresh — that's the Realtime subscription
   in `dashboard.js` picking up the Postgres change event.
4. Insert a row in `budgets` for the current month (`month` = first of this
   month) — the Budget Status panel switches from the empty state to the
   progress bar, spent/total figures, and a daily safe-to-spend note.
5. Set `budget_amount` low enough that today's expenses exceed it — the
   progress bar turns red and the note switches to an over-budget message.

## Verifying Phase 4 works

1. On the Dashboard, click the **+** floating action button — the add
   transaction modal opens with an Expense/Income toggle. Add an expense;
   the dashboard refreshes instantly (same Realtime path as Phase 3).
2. Go to **Transactions**. Click **Add transaction**, switch to Income,
   fill it in, and optionally attach a receipt image — it uploads to the
   private `receipts` Storage bucket and creates a linked `receipts` row.
3. Click a row's pencil icon to edit it, and the trash icon to delete it
   (with a confirm prompt). Both update the table immediately.
4. Type in the search box — results filter after a short debounce. Use the
   type/category dropdowns together with search; they combine (AND logic).
5. Click the **Date**, **Title**, or **Amount** column headers to sort;
   click again to reverse direction — the arrow indicator shows the active
   sort.
6. Add more than 15 transactions to see pagination controls appear at the
   bottom; page through and confirm counts match what's in Supabase.
7. Click **Export CSV** — downloads a `.csv` respecting your current
   search/filter (not just the visible page). Click **Export PDF** — same
   data, formatted as a branded table via jsPDF (loaded lazily from CDN
   only when you actually click export).

## Verifying Phase 5 works

1. Run migration `003_analytics_rpcs.sql` (see step 1 above) — it adds
   `get_period_series`, `get_category_totals`, and `get_budget_history`,
   all `security invoker` with an explicit `auth.uid()` check on top of RLS.
2. Go to **Analytics** with a brand-new account — every chart shows its
   empty-state message ("No transactions in this range yet.", etc.)
   instead of an empty canvas or a crash.
3. Add a few expenses and an income entry on different dates, then reopen
   Analytics — **Income vs Expense** and **Spending Over Time** populate,
   and **Category Breakdown** shows a slice per category you used.
4. Change the range dropdown (Daily / Weekly / Monthly / Yearly) — all
   three range-dependent charts re-fetch and re-render for that
   granularity; the category pie's window follows the same range.
5. Set a monthly budget (Budget page or directly in `budgets`) — **Budget
   Progress** switches from its empty state to a budget-vs-spent bar per
   month, and **Savings Trend** reflects income − expense for the last
   6 months.
6. Toggle dark mode from the topbar — all five charts restyle in place
   (text/grid colors flip) without a page reload, via the
   `spendy:theme-change` event `theme.js` now dispatches.
7. Add a transaction in another tab — Analytics picks it up via the same
   debounced Realtime subscription pattern as the Dashboard and
   Transactions pages, and re-renders within ~400ms.

## Verifying Phase 6 works

1. Complete step 3.5 above (secrets set, all five functions deployed).
2. **Category suggestion**: open Add Transaction, type "Starbucks" as the
   title — after a short pause the Category select jumps to "Food" with a
   small "AI suggested" badge. Change it manually and the badge disappears
   (your choice always wins).
3. **Receipt scanning**: attach a receipt photo in Add Transaction — status
   text walks through "Uploading receipt…" → "Scanning receipt with AI…",
   then the title/amount/date/category fields fill in. A blurry or unclear
   photo should show "confidence was low, please double-check" instead of
   silently guessing.
4. **Voice entry**: click the mic button (Dashboard's second FAB, or
   Transactions toolbar), allow microphone access, say something like "I
   spent 250 rupees on lunch today", tap the mic again to stop — a toast
   shows the transcript and a pre-filled expense modal opens for you to
   confirm before saving.
5. **AI Insights**: with a few transactions logged, open AI Insights — a
   summary line plus 3-6 insight cards appear, each referencing your real
   numbers. "Refresh insights" forces a new GPT-5 generation instead of the
   6-hour cache.
6. **Budget recommendations**: on the Budget page, click "Set monthly
   budget", enter an amount — the progress ring, remaining/day figures, and
   a Budget Health Score appear, plus 3-5 GPT-5-written recommendation
   lines referencing your actual spending pace.
7. Check `ai_reports` in the Supabase table editor — rows appear only after
   calling the functions above, confirming the client can't insert there
   directly (writes only happen via the service-role client inside the
   Edge Functions, after JWT verification).

## What's next

- **Phase 7** — testing, performance pass (Lighthouse tuning, image/query
  optimization, lazy loading), and a final security review.

Say the word and I'll pick up with Phase 7.
