// ============================================================================
// Spendy — Sanitization Utility
//
// Anywhere text that didn't originate as a hard-coded string literal is
// interpolated into an innerHTML template, it must be passed through
// escapeHtml() first. This covers two categories in Spendy:
//   1. GPT-5 output (insight summaries/titles/details, budget recommendation
//      sentences) — structured-output schemas constrain the *shape* but not
//      the text content, so it's still untrusted for HTML purposes.
//   2. OAuth profile fields (full_name, avatar alt text) — a user controls
//      their own Google account display name, so it's attacker-reachable.
// Data the app already renders via .textContent (transaction titles,
// descriptions, etc.) doesn't need this — textContent never parses HTML.
// ============================================================================

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for safe interpolation into an innerHTML template string. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
