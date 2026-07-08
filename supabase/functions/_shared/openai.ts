// ============================================================================
// Spendy — Shared OpenAI Helper for Edge Functions
//
// Centralizes every OpenAI call so the API key only ever lives in one place
// (Supabase Edge Function secrets, set via `supabase secrets set
// OPENAI_API_KEY=...`). It is read here from Deno.env and NEVER returned to
// the client in any response body.
// ============================================================================

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const CHAT_MODEL = Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-5';
const TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-transcribe';

if (!OPENAI_API_KEY) {
  console.error('[Spendy] OPENAI_API_KEY is not set in Edge Function secrets.');
}

/**
 * Call the Chat Completions API and force a strict JSON Schema response, so
 * the caller gets back a parsed object it can trust the shape of instead of
 * scraping free text.
 */
export async function chatJSON({
  system,
  messages,
  schemaName,
  schema,
  temperature = 0.2,
}: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature,
      messages: [{ role: 'system', content: system }, ...messages],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI chat completion failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response.');
  return JSON.parse(content);
}

/**
 * Transcribe an audio clip (voice expense entry) via OpenAI Speech-to-Text.
 * `audioBlob` should already be a Blob/File-like object (Deno's fetch
 * FormData supports Blob directly).
 */
export async function transcribeAudio(audioBlob: Blob, filename = 'voice.webm') {
  const form = new FormData();
  form.append('file', audioBlob, filename);
  form.append('model', TRANSCRIBE_MODEL);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI transcription failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.text as string;
}
