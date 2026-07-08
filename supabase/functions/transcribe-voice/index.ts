// ============================================================================
// Spendy — transcribe-voice Edge Function
// Input:  { audio: string (base64), mimeType: string }
// Output: { transcript, type, title, amount, category, source, date, description }
//
// e.g. "I spent 250 rupees on lunch today" ->
//   { transcript: "...", type: "expense", title: "Lunch", amount: 250,
//     category: "Food", date: "2026-07-08", description: null }
// ============================================================================

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/authClient.ts';
import { chatJSON, transcribeAudio } from '../_shared/openai.ts';

const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Education', 'Medical',
  'Entertainment', 'Bills', 'Rent', 'Travel', 'Other',
];
const SOURCES = ['Pocket Money', 'Salary', 'Scholarship', 'Freelancing', 'Gift', 'Other'];

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if ('error' in auth) return errorResponse(auth.error, 401);

  try {
    const { audio, mimeType } = await req.json();
    if (!audio) return errorResponse('"audio" (base64) is required.');

    const blob = base64ToBlob(audio, mimeType || 'audio/webm');
    if (blob.size > 15 * 1024 * 1024) return errorResponse('Audio clip is too large (max 15MB).');

    const transcript = await transcribeAudio(blob, `voice.${(mimeType || 'audio/webm').split('/')[1] || 'webm'}`);
    if (!transcript?.trim()) return errorResponse('Could not transcribe any speech from that clip.');

    const todayISO = new Date().toISOString().slice(0, 10);

    const parsed = await chatJSON({
      system:
        `You convert a spoken sentence about a personal expense or income into structured ` +
        `fields for a finance-tracking app. Today's date is ${todayISO}; resolve relative dates ` +
        `like "today", "yesterday", "last Monday" against it and return an ISO date (YYYY-MM-DD). ` +
        `Decide "type" as "expense" unless the sentence clearly describes money received ` +
        `(salary, gift, pocket money, freelance payment, scholarship), in which case use "income". ` +
        `For expense, pick a "category" from the allowed list; for income, pick a "source" from the ` +
        `allowed list, and leave the other field null. "title" should be a short 2-4 word label ` +
        `(e.g. "Lunch", "Uber ride"). If an amount isn't clearly stated, set amount to null instead ` +
        `of guessing.`,
      messages: [{ role: 'user', content: `Spoken text: "${transcript.trim()}"` }],
      schemaName: 'voice_expense_extraction',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          title: { type: 'string' },
          amount: { type: ['number', 'null'] },
          category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
          source: { type: ['string', 'null'], enum: [...SOURCES, null] },
          date: { type: 'string' },
          description: { type: ['string', 'null'] },
        },
        required: ['type', 'title', 'amount', 'category', 'source', 'date', 'description'],
      },
    });

    return jsonResponse({ transcript, ...parsed });
  } catch (err) {
    console.error('[transcribe-voice]', err);
    return errorResponse(err.message || 'Failed to process voice entry.', 500);
  }
});
