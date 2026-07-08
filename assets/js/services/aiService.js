// ============================================================================
// Spendy — AI Service (client)
// Thin wrapper around the OpenAI-powered Supabase Edge Functions. The actual
// OpenAI API key never reaches the browser — `supabase.functions.invoke`
// automatically attaches the current user's session JWT, which each
// function verifies server-side before doing anything (see
// supabase/functions/_shared/authClient.ts).
// ============================================================================

import { supabase } from './supabaseClient.js';

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // supabase-js wraps non-2xx responses in a FunctionsHttpError; try to
    // surface the function's own error message rather than a generic one.
    let message = error.message || 'AI request failed.';
    try {
      const parsed = await error.context?.json?.();
      if (parsed?.error) message = parsed.error;
    } catch {
      /* fall back to the generic message above */
    }
    throw new Error(message);
  }
  return data;
}

/** Suggest a category for an expense title as the user types. */
export function suggestCategory(title) {
  return invoke('categorize-expense', { title });
}

/** Trigger GPT-5 Vision extraction on an already-uploaded receipt row. */
export function scanReceipt(receiptId) {
  return invoke('scan-receipt', { receiptId });
}

/** Send a recorded voice clip (base64) for transcription + field extraction. */
export function transcribeVoiceEntry(audioBase64, mimeType) {
  return invoke('transcribe-voice', { audio: audioBase64, mimeType });
}

/** Fetch (or regenerate) this month's AI financial insights. */
export function fetchAIInsights(forceRefresh = false) {
  return invoke('generate-insights', { forceRefresh });
}

/** Fetch (or regenerate) this month's smart budget recommendations. */
export function fetchBudgetRecommendations(forceRefresh = false) {
  return invoke('budget-recommendation', { forceRefresh });
}
