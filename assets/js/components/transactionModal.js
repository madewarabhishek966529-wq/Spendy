// ============================================================================
// Spendy — Transaction Modal
// Shared add/edit form for income + expense transactions. Handles its own
// validation, optional receipt upload (via receiptService), and calls
// createTransaction/updateTransaction from transactionService.
//
// AI-assisted category suggestion (typing "Starbucks" -> auto-suggest Food)
// and AI receipt scanning are wired up in Phase 6 via the OpenAI Edge
// Functions; the category/source fields here are manual selects until then,
// exactly matching what the schema's `ai_categorized` flag expects (false
// for manual entries).
// ============================================================================

import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { createTransaction, updateTransaction } from '../services/transactionService.js';
import { uploadReceipt } from '../services/receiptService.js';
import { suggestCategory, scanReceipt } from '../services/aiService.js';
import { icons } from '../utils/icons.js';

const EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Education', 'Medical',
  'Entertainment', 'Bills', 'Rent', 'Travel', 'Other',
];
const INCOME_SOURCES = ['Pocket Money', 'Salary', 'Scholarship', 'Freelancing', 'Gift', 'Other'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function optionsHTML(values, selected) {
  return values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
}

/**
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {Object} [opts.transaction] - pass to edit an existing transaction
 * @param {Object} [opts.prefill] - pass to pre-fill an add-mode form (e.g. from voice entry)
 * @param {() => void} opts.onSaved - called after a successful create/update
 */
export function openTransactionModal({ userId, transaction = null, prefill = null, onSaved }) {
  const isEdit = Boolean(transaction);
  const source = transaction ?? prefill ?? null;
  let type = source?.type ?? 'expense';

  const bodyHTML = `
    <form id="tx-form" novalidate>
      <div class="type-toggle" role="tablist" aria-label="Transaction type">
        <button type="button" class="type-toggle-btn" data-type="expense">Expense</button>
        <button type="button" class="type-toggle-btn" data-type="income">Income</button>
      </div>

      ${prefill ? `<div class="ai-source-banner">${icons.sparkle} Pre-filled from your voice entry — please review before saving.</div>` : ''}

      <div class="form-group">
        <label class="field-label" for="tx-title">Title</label>
        <input class="field-input" id="tx-title" name="title" type="text" required
               placeholder="e.g. Starbucks, Freelance payment" value="${source?.title ?? ''}" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="field-label" for="tx-amount">Amount</label>
          <input class="field-input" id="tx-amount" name="amount" type="number" min="0.01" step="0.01" required
                 value="${source?.amount ?? ''}" />
        </div>
        <div class="form-group">
          <label class="field-label" for="tx-date">Date</label>
          <input class="field-input" id="tx-date" name="transaction_date" type="date" required
                 value="${source?.transaction_date ?? source?.date ?? todayISO()}" />
        </div>
      </div>

      <div class="form-group" id="tx-category-group">
        <label class="field-label" for="tx-category">
          Category <span class="ai-badge u-hidden" id="tx-category-ai-badge">${icons.sparkle} AI suggested</span>
        </label>
        <select class="field-input" id="tx-category" name="category">
          ${optionsHTML(EXPENSE_CATEGORIES, source?.category)}
        </select>
      </div>

      <div class="form-group" id="tx-source-group" style="display:none;">
        <label class="field-label" for="tx-source">Source</label>
        <select class="field-input" id="tx-source" name="source">
          ${optionsHTML(INCOME_SOURCES, source?.source)}
        </select>
      </div>

      <div class="form-group">
        <label class="field-label" for="tx-description">Description <span class="u-muted">(optional)</span></label>
        <input class="field-input" id="tx-description" name="description" type="text"
               value="${source?.description ?? ''}" />
      </div>

      ${!isEdit ? `
      <div class="form-group">
        <label class="field-label">Receipt image <span class="u-muted">(optional — Spendy's AI will read it for you)</span></label>
        <label class="file-drop" id="tx-file-drop" for="tx-file">
          <span id="tx-file-label">Click to attach a photo of your receipt</span>
        </label>
        <input type="file" id="tx-file" accept="image/jpeg,image/png,image/webp,image/heic" class="u-hidden" />
        <p class="ai-scan-status u-hidden" id="tx-scan-status"></p>
      </div>` : ''}

      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" id="tx-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn--primary" id="tx-submit-btn">
          ${isEdit ? 'Save changes' : 'Add transaction'}
        </button>
      </div>
    </form>
  `;

  const { dialog } = openModal({
    title: isEdit ? 'Edit transaction' : 'Add transaction',
    bodyHTML,
  });

  const form = dialog.querySelector('#tx-form');
  const categoryGroup = dialog.querySelector('#tx-category-group');
  const sourceGroup = dialog.querySelector('#tx-source-group');
  const toggleBtns = dialog.querySelectorAll('.type-toggle-btn');

  function applyType(newType) {
    type = newType;
    toggleBtns.forEach((btn) => {
      btn.classList.toggle(`is-active--${btn.dataset.type}`, btn.dataset.type === type);
    });
    categoryGroup.style.display = type === 'expense' ? '' : 'none';
    sourceGroup.style.display = type === 'income' ? '' : 'none';
  }
  toggleBtns.forEach((btn) => btn.addEventListener('click', () => applyType(btn.dataset.type)));
  applyType(type);

  // ---- AI: category suggestion as the user types a title (expense only) ----
  const titleInput = dialog.querySelector('#tx-title');
  const categorySelect = dialog.querySelector('#tx-category');
  const categoryBadge = dialog.querySelector('#tx-category-ai-badge');
  let categoryTouchedManually = Boolean(source?.category);
  let categorySuggestTimer = null;

  categorySelect?.addEventListener('change', () => {
    categoryTouchedManually = true;
    categoryBadge?.classList.add('u-hidden');
  });

  titleInput?.addEventListener('input', () => {
    if (type !== 'expense' || categoryTouchedManually) return;
    clearTimeout(categorySuggestTimer);
    const value = titleInput.value.trim();
    if (value.length < 3) return;
    categorySuggestTimer = setTimeout(async () => {
      try {
        const { category } = await suggestCategory(value);
        if (category && !categoryTouchedManually && titleInput.value.trim() === value) {
          categorySelect.value = category;
          categoryBadge?.classList.remove('u-hidden');
        }
      } catch (err) {
        console.warn('[Spendy] Category suggestion skipped:', err.message);
      }
    }, 600);
  });

  // ---- Receipt upload + AI scan (add-mode only) ----
  let selectedFile = null;
  let uploadedReceiptId = null;
  const fileInput = dialog.querySelector('#tx-file');
  const fileDrop = dialog.querySelector('#tx-file-drop');
  const scanStatus = dialog.querySelector('#tx-scan-status');

  fileInput?.addEventListener('change', async () => {
    selectedFile = fileInput.files?.[0] ?? null;
    if (!selectedFile) return;

    fileDrop.classList.add('has-file');
    dialog.querySelector('#tx-file-label').textContent = `Attached: ${selectedFile.name}`;
    scanStatus.classList.remove('u-hidden');
    scanStatus.textContent = 'Uploading receipt…';

    try {
      const receipt = await uploadReceipt(userId, selectedFile);
      uploadedReceiptId = receipt.id;

      scanStatus.textContent = 'Scanning receipt with AI…';
      const extracted = await scanReceipt(uploadedReceiptId);

      if (!titleInput.value.trim() && extracted.merchant_name) titleInput.value = extracted.merchant_name;
      const amountInput = dialog.querySelector('#tx-amount');
      if (!amountInput.value && extracted.amount) amountInput.value = extracted.amount;
      const dateInput = dialog.querySelector('#tx-date');
      if (extracted.date) dateInput.value = extracted.date;
      if (extracted.suggested_category) {
        categorySelect.value = extracted.suggested_category;
        categoryBadge?.classList.remove('u-hidden');
      }

      scanStatus.textContent = extracted.needs_review
        ? 'Scanned — confidence was low, please double-check the details above.'
        : 'Receipt scanned — details filled in above, feel free to adjust.';
      toast.success(extracted.needs_review ? 'Receipt scanned — please confirm details.' : 'Receipt scanned successfully.');
    } catch (err) {
      console.error('[Spendy] Receipt scan failed:', err.message);
      scanStatus.textContent = 'Uploaded, but AI scanning failed — you can still fill the form manually.';
      toast.error(err.message || 'Could not scan receipt.');
    }
  });

  dialog.querySelector('#tx-cancel-btn').addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = dialog.querySelector('#tx-submit-btn');
    const formData = new FormData(form);

    const title = formData.get('title')?.toString().trim();
    const amount = Number(formData.get('amount'));
    const transactionDate = formData.get('transaction_date');
    const description = formData.get('description')?.toString().trim() || null;

    if (!title) return toast.error('Please enter a title.');
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Please enter a valid amount.');
    if (!transactionDate) return toast.error('Please pick a date.');

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving…' : 'Adding…';

    try {
      const receiptId = transaction?.receipt_id ?? uploadedReceiptId ?? null;

      const payload = {
        user_id: userId,
        type,
        title,
        amount,
        transaction_date: transactionDate,
        description,
        category: type === 'expense' ? formData.get('category') : null,
        source: type === 'income' ? formData.get('source') : null,
        receipt_id: receiptId,
        ai_categorized: type === 'expense' && !categoryBadge?.classList.contains('u-hidden'),
      };

      if (isEdit) {
        delete payload.user_id; // never allow reassigning ownership on update
        await updateTransaction(transaction.id, payload);
        toast.success('Transaction updated.');
      } else {
        await createTransaction(payload);
        toast.success(type === 'income' ? 'Income added.' : 'Expense added.');
      }

      closeModal();
      onSaved?.();
    } catch (err) {
      console.error('[Spendy] Failed to save transaction:', err.message);
      toast.error(err.message || 'Could not save transaction.');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Save changes' : 'Add transaction';
    }
  });
}
