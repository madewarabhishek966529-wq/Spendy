// ============================================================================
// Spendy — categorize-expense Edge Function
// Input:  { title: string }
// Output: { category: string, confidence: number }
// Called as the user types an expense title (debounced client-side) so the
// category select can be pre-filled. The user can always override it.
// ============================================================================

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/authClient.ts';
import { chatJSON } from '../_shared/openai.ts';

const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Education', 'Medical',
  'Entertainment', 'Bills', 'Rent', 'Travel', 'Other',
];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if ('error' in auth) return errorResponse(auth.error, 401);

  try {
    const { title } = await req.json();
    if (!title || typeof title !== 'string' || !title.trim()) {
      return errorResponse('A non-empty "title" is required.');
    }

    const result = await chatJSON({
      system:
        'You categorize personal expense line-items for a budgeting app used mainly by ' +
        'students and young professionals. Pick exactly one category from the allowed list ' +
        'that best matches the merchant or expense title. If genuinely ambiguous, use "Other" ' +
        'with a lower confidence score rather than guessing wildly.',
      messages: [{ role: 'user', content: `Expense title: "${title.trim()}"` }],
      schemaName: 'expense_category_suggestion',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['category', 'confidence'],
      },
    });

    return jsonResponse(result);
  } catch (err) {
    console.error('[categorize-expense]', err);
    return errorResponse(err.message || 'Failed to categorize expense.', 500);
  }
});
