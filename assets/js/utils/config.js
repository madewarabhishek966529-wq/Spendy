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
  SUPABASE_URL: 'https://xzltepxmaedhevwvsnjt.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bHRlcHhtYWVkaGV2d3Zzbmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI2OTgsImV4cCI6MjA5OTA3ODY5OH0.rzYaBi12lGu9XovMTvFRsiDXl26UT5Ch2sTbwLCz8ao',
  APP_NAME: 'Spendy',
  APP_ENV: 'development' || 'development',
});
