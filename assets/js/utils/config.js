// ============================================================================
// Spendy — Runtime Configuration
//
// This file is intentionally the ONLY place that reads environment values.
// Because Spendy has no bundler (plain HTML/CSS/vanilla JS per the project
// spec), env vars can't be inlined by webpack/vite define plugins. Instead,
// `scripts/inject-env.js` (run automatically by `vercel-build`, see
// package.json) rewrites the `__SPENDY_ENV__` placeholders below at deploy
// time using Vercel's environment variables. Locally, copy `.env.example` to
// `.env` and run `npm run build:config` before opening index.html.
//
// Never put the OpenAI API key here — it must only ever live in the Supabase
// Edge Function's server-side environment, never shipped to the browser.
// ============================================================================

export const SPENDY_CONFIG = Object.freeze({
  SUPABASE_URL: '__SPENDY_ENV__SUPABASE_URL__',
  SUPABASE_ANON_KEY: '__SPENDY_ENV__SUPABASE_ANON_KEY__',
  APP_NAME: 'Spendy',
  APP_ENV: '__SPENDY_ENV__NODE_ENV__' || 'development',
});
