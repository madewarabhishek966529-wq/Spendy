// ============================================================================
// Spendy — scan-receipt Edge Function
// Input:  { receiptId: string }
// Output: { receiptId, merchant_name, amount, date, items, tax_amount,
//           payment_method, suggested_category, confidence, needs_review }
//
// Flow: load the receipts row (RLS-scoped to the caller) -> download the
// image from the private `receipts` Storage bucket -> send to GPT-5 Vision
// for structured extraction -> write results back onto the receipts row ->
// return them so the client can pre-fill the transaction form.
// ============================================================================

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { authenticate } from '../_shared/authClient.ts';
import { chatJSON } from '../_shared/openai.ts';

const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Education', 'Medical',
  'Entertainment', 'Bills', 'Rent', 'Travel', 'Other',
];

const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

function guessMimeType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if ('error' in auth) return errorResponse(auth.error, 401);
  const { user, userClient } = auth;

  try {
    const { receiptId } = await req.json();
    if (!receiptId) return errorResponse('"receiptId" is required.');

    // RLS ensures this only returns a row if it belongs to the caller.
    const { data: receipt, error: fetchError } = await userClient
      .from('receipts')
      .select('id, user_id, storage_path, status')
      .eq('id', receiptId)
      .single();

    if (fetchError || !receipt) return errorResponse('Receipt not found.', 404);
    if (receipt.user_id !== user.id) return errorResponse('Forbidden.', 403);

    const { data: fileBlob, error: downloadError } = await userClient.storage
      .from('receipts')
      .download(receipt.storage_path);
    if (downloadError || !fileBlob) throw downloadError ?? new Error('Could not download receipt image.');

    const base64 = await blobToBase64(fileBlob);
    const mimeType = guessMimeType(receipt.storage_path);

    const extracted = await chatJSON({
      system:
        'You extract structured data from photos of retail/restaurant receipts for a ' +
        'personal finance app. Read the image carefully. Dates should be ISO (YYYY-MM-DD) ' +
        'when determinable. Amount is the final total paid (including tax) as a plain number. ' +
        'If any field is illegible or absent, return null for it rather than inventing a value. ' +
        'Set confidence lower whenever the image is blurry, cropped, or ambiguous — do not guess ' +
        'and report high confidence.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the receipt details from this image.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      schemaName: 'receipt_extraction',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          merchant_name: { type: ['string', 'null'] },
          amount: { type: ['number', 'null'] },
          date: { type: ['string', 'null'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                price: { type: ['number', 'null'] },
                quantity: { type: ['number', 'null'] },
              },
              required: ['name', 'price', 'quantity'],
            },
          },
          tax_amount: { type: ['number', 'null'] },
          payment_method: { type: ['string', 'null'] },
          suggested_category: { type: 'string', enum: CATEGORIES },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'merchant_name', 'amount', 'date', 'items', 'tax_amount',
          'payment_method', 'suggested_category', 'confidence',
        ],
      },
    });

    const needsReview = extracted.confidence < CONFIDENCE_REVIEW_THRESHOLD;

    const { error: updateError } = await userClient
      .from('receipts')
      .update({
        merchant_name: extracted.merchant_name,
        extracted_amount: extracted.amount,
        extracted_date: extracted.date,
        purchased_items: extracted.items,
        tax_amount: extracted.tax_amount,
        payment_method: extracted.payment_method,
        suggested_category: extracted.suggested_category,
        confidence_score: extracted.confidence,
        ai_raw_response: extracted,
        status: needsReview ? 'needs_review' : 'processed',
      })
      .eq('id', receiptId);

    if (updateError) throw updateError;

    return jsonResponse({ receiptId, ...extracted, needs_review: needsReview });
  } catch (err) {
    console.error('[scan-receipt]', err);
    return errorResponse(err.message || 'Failed to scan receipt.', 500);
  }
});
