# Setup & Run

Quick-start guide to get Spendy running locally. For the full feature
walkthrough and phase-by-phase verification steps, see `README.md`.

## Prerequisites

- Node.js ≥ 18
- A free [Supabase](https://supabase.com) account
- A [Google Cloud](https://console.cloud.google.com/apis/credentials)
  project (for Google sign-in)
- An [OpenAI](https://platform.openai.com) API key (for the AI features —
  categorization, receipt scanning, voice entry, insights, budget
  recommendations)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) — `npm install
  -g supabase`, or use `npx supabase`

## 1. Install dependencies

```bash
git clone <this-repo-url>
cd spendy
npm install
```

## 2. Create the Supabase project

1. [supabase.com](https://supabase.com) → **New Project**.
2. **SQL Editor** → run each migration in order:
   `supabase/migrations/001_initial_schema.sql`,
   `002_dashboard_summary_rpc.sql`, `003_analytics_rpcs.sql`.
   (Or, once linked via the CLI: `supabase db push`.)
3. **Authentication → Providers** → enable **Google**.

## 3. Set up Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → **Create Credentials → OAuth 2.0 Client ID** (type: Web application).
2. Authorized redirect URI — copy the exact value from Supabase
   (**Authentication → Providers → Google**), it looks like:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Paste the resulting Client ID and Client Secret into Supabase's Google
   provider settings and save.

## 4. Configure environment variables (client)

```bash
cp .env.example .env
```

Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` from **Supabase → Project
Settings → API**, then generate `config.js`:

```bash
npm run build:config
```

**Never** put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `.env` —
those are server-only secrets and belong in Supabase Edge Function
secrets (next step). `.env` and `config.js`'s generated output are
git-ignored on purpose.

## 5. Deploy the AI Edge Functions

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Server-only secrets — never exposed to the client:
supabase secrets set OPENAI_API_KEY=sk-qVAblxOFne9ozgDxSbPyhs9ZMm7MeRk3XJj6OVAOdS1WqGBYBmz211DPnMhhIX8g
# Optional model overrides (defaults shown):
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
automatically available to every deployed function — no need to set
those as secrets yourself.

## 6. Run it

```bash
npm run dev
# open http://localhost:5500
```

This app uses native ES modules with no bundler, so it **must** be served
over HTTP — opening `index.html` directly as a `file://` path will break
`import` statements.

## 7. Verify it works

1. Open `http://localhost:5500` → **Continue with Google** → you land on
   the Dashboard.
2. Add a transaction (the **+** button) — it appears instantly.
3. Type an expense title like "Starbucks" in Add Transaction — the
   category auto-suggests after a short pause (confirms the AI Edge
   Functions are reachable).
4. Attach a receipt photo — status walks through "Uploading…" →
   "Scanning receipt with AI…" and fills in the form.

If any of these don't work, check the browser console and your Supabase
Edge Function logs (`supabase functions logs <name>`) first — most setup
issues trace back to a missing secret or an unrun migration.

## 8. Deploy to production (optional)

1. Push this repo to GitHub, import it at [vercel.com/new](https://vercel.com/new).
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under **Project Settings →
   Environment Variables** (Production + Preview).
3. Deploy — `vercel.json` already points the build command at `npm run
   vercel-build`, which runs `build:config` before serving.
4. Back in Supabase → **Authentication → URL Configuration**, add your
   Vercel domain to **Site URL** and **Redirect URLs**.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank page / console errors about `import` | Opened via `file://` instead of a local server — use `npm run dev` |
| "Missing Supabase configuration" error | Forgot `npm run build:config`, or `.env` values are wrong |
| Google sign-in redirects to an error page | Redirect URI mismatch between Google Cloud Console and Supabase |
| AI features fail with a 401 | Edge Function secrets not set, or functions not deployed — recheck step 5 |
| AI features fail with a 500 | Check `supabase functions logs <name>` — usually a missing/invalid `OPENAI_API_KEY` |
