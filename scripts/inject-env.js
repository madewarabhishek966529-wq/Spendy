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

const REQUIRED_PUBLIC_VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function main() {
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
