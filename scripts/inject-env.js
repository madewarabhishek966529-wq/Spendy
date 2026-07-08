#!/usr/bin/env node
// ============================================================================
// Spendy — Env Injection Script
// Runs at deploy time (Vercel build command) and locally via `npm run
// build:config`. Replaces __SPENDY_ENV__KEY__ placeholders in
// assets/js/utils/config.js with real values from process.env, writing the
// result in place. Only PUBLIC values belong here (Supabase URL + anon key),
// which are safe to ship to the browser because RLS enforces data access —
// never the OpenAI key or the Supabase service role key.
// ============================================================================

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'assets', 'js', 'utils', 'config.js');
const ENV_PATH = path.join(__dirname, '..', '.env');

const REQUIRED_PUBLIC_VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

/**
 * ROOT-CAUSE FIX: this script previously only read from `process.env`, but
 * nothing in the project ever loaded `.env` into `process.env` (no `dotenv`
 * package, no `--env-file` flag on the npm script). That meant
 * `npm run build:config` — the exact command SETUP.md tells you to run
 * right after `cp .env.example .env` — always failed with "Missing required
 * env vars" and exited before touching config.js, even when `.env` was
 * filled in correctly. As a result config.js kept its literal
 * `__SPENDY_ENV__...__` placeholder strings, which made `createClient()` in
 * supabaseClient.js throw on `new URL(...)` at module-evaluation time,
 * silently aborting the whole import chain (supabaseClient.js ->
 * authService.js -> login.js) before the "Continue with Google" button's
 * click listener was ever attached.
 *
 * Fix: parse `.env` ourselves (simple KEY=VALUE parser, no extra
 * dependency needed) and merge it into `process.env`, so
 * `npm run build:config` actually works as documented. Real environment
 * variables (e.g. set by Vercel at build time) still take precedence over
 * `.env`.
 */
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't clobber a value already set in the real environment (e.g.
    // Vercel's build-time env vars should win over a stray .env file).
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function main() {
  loadDotEnv(ENV_PATH);

  let contents = fs.readFileSync(CONFIG_PATH, 'utf8');

  const missing = REQUIRED_PUBLIC_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`[Spendy] Missing required env vars: ${missing.join(', ')}`);
    console.error('[Spendy] Set them in your Vercel project settings or local .env file.');
    process.exit(1);
  }

  for (const key of REQUIRED_PUBLIC_VARS) {
    const placeholder = `__SPENDY_ENV__${key}__`;
    contents = contents.split(placeholder).join(process.env[key]);
  }
  contents = contents.split('__SPENDY_ENV__NODE_ENV__').join(process.env.NODE_ENV || 'production');

  fs.writeFileSync(CONFIG_PATH, contents, 'utf8');
  console.log('[Spendy] Environment injected into config.js successfully.');
}

main();
