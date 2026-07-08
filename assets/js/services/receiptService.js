// ============================================================================
// Spendy — Receipt Service
// Uploads a receipt image to the private `receipts` Storage bucket (per-user
// folder, enforced by the RLS policies in migration 001) and creates the
// matching `receipts` table row. AI extraction (merchant, amount, items,
// confidence scoring) is wired up in Phase 6 via the OpenAI Vision Edge
// Function — for now this just stores the file and leaves those fields
// null so a transaction can still reference a real uploaded receipt.
// ============================================================================

import { supabase } from './supabaseClient.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export function validateReceiptFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Please upload a JPG, PNG, WEBP, or HEIC image.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Receipt image must be smaller than 8MB.');
  }
}

/**
 * Upload a receipt image and create its `receipts` row.
 * @returns {Promise<{ id: string, storage_path: string }>}
 */
export async function uploadReceipt(userId, file) {
  validateReceiptFile(file);

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('receipts')
    .insert({ user_id: userId, storage_path: path, status: 'pending' })
    .select('id, storage_path')
    .single();

  if (error) {
    // Roll back the upload if the row insert failed, so we don't leak
    // orphaned files in storage.
    await supabase.storage.from('receipts').remove([path]);
    throw error;
  }

  return data;
}

/** Get a short-lived signed URL to display a receipt image (bucket is private). */
export async function getReceiptSignedUrl(storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
