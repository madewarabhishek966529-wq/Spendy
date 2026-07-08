// ============================================================================
// Spendy — Transactions Page Entry Script (Phase 4)
// Full CRUD: search, type/category filters, sortable columns, pagination,
// add/edit modal, delete with confirmation, CSV/PDF export, and a Realtime
// subscription so edits from other devices show up live.
// ============================================================================

import { requireAuth } from '../utils/routeGuard.js';
import { applyStoredTheme } from '../utils/theme.js';
import { mountShell } from '../utils/shell.js';
import { toast } from '../components/toast.js';
import { icons } from '../utils/icons.js';
import { openTransactionModal } from '../components/transactionModal.js';
import { openVoiceEntry } from '../components/voiceEntry.js';
import {
  fetchTransactionsPage,
  fetchTransactionsForExport,
  deleteTransaction,
  subscribeToTransactions,
} from '../services/transactionService.js';
import { supabase } from '../services/supabaseClient.js';
import { formatCurrency, formatDateShort } from '../utils/formatters.js';
import { exportTransactionsToCsv } from '../utils/csvExport.js';

applyStoredTheme();

const PAGE_SIZE = 15;

const state = {
  page: 1,
  search: '',
  type: 'all',
  category: 'all',
  sortColumn: 'transaction_date',
  sortDirection: 'desc',
  totalCount: 0,
};

let currentUser = null;
let currency = 'INR';

const user = await requireAuth();
if (user) {
  currentUser = user;
  mountShell({ active: 'transactions', title: 'Transactions', user });
  currency = await loadCurrency(user.id);
  wireToolbar();
  wireSortableHeaders();
  await loadPage();

  let refreshTimer = null;
  subscribeToTransactions(user.id, () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadPage, 300);
  });
}

async function loadCurrency(userId) {
  const { data } = await supabase.from('profiles').select('currency').eq('id', userId).single();
  return data?.currency ?? 'INR';
}

function wireToolbar() {
  const searchInput = document.getElementById('tx-search');
  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value;
      state.page = 1;
      loadPage();
    }, 300);
  });

  document.getElementById('tx-filter-type')?.addEventListener('change', (e) => {
    state.type = e.target.value;
    state.page = 1;
    loadPage();
  });

  document.getElementById('tx-filter-category')?.addEventListener('change', (e) => {
    state.category = e.target.value;
    state.page = 1;
    loadPage();
  });

  document.getElementById('add-tx-btn')?.addEventListener('click', () => {
    openTransactionModal({ userId: currentUser.id, onSaved: loadPage });
  });

  const voiceBtn = document.getElementById('voice-tx-btn');
  if (voiceBtn) voiceBtn.innerHTML = icons.mic;
  voiceBtn?.addEventListener('click', () => {
    openVoiceEntry({ userId: currentUser.id, onSaved: loadPage });
  });

  document.getElementById('export-csv-btn')?.addEventListener('click', handleExportCsv);
  document.getElementById('export-pdf-btn')?.addEventListener('click', handleExportPdf);
}

function wireSortableHeaders() {
  document.querySelectorAll('.data-table th.is-sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = column;
        state.sortDirection = 'desc';
      }
      state.page = 1;
      loadPage();
    });
  });
}

function updateSortIndicators() {
  document.querySelectorAll('.data-table th.is-sortable').forEach((th) => {
    const isSorted = th.dataset.sort === state.sortColumn;
    th.classList.toggle('is-sorted', isSorted);
    const arrow = th.querySelector('.sort-arrow');
    arrow.innerHTML = isSorted
      ? (state.sortDirection === 'asc' ? icons.chevronUp : icons.chevronDown)
      : icons.chevronDown;
  });
}

async function loadPage() {
  try {
    const { rows, count } = await fetchTransactionsPage(currentUser.id, {
      page: state.page,
      pageSize: PAGE_SIZE,
      search: state.search,
      type: state.type,
      category: state.category,
      sortColumn: state.sortColumn,
      sortDirection: state.sortDirection,
    });
    state.totalCount = count;
    renderTable(rows);
    renderPagination();
    updateSortIndicators();
  } catch (err) {
    console.error('[Spendy] Failed to load transactions:', err.message);
    toast.error('Could not load transactions.');
  }
}

function renderTable(rows) {
  const tbody = document.getElementById('tx-table-body');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state-block">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>
          <h3>No transactions found</h3>
          <p>${state.search || state.type !== 'all' || state.category !== 'all'
            ? 'Try adjusting your search or filters.'
            : 'Add your first income or expense to start building your history.'}</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  for (const tx of rows) {
    const tr = document.createElement('tr');
    const label = tx.type === 'income' ? tx.source : tx.category;
    const sign = tx.type === 'income' ? '+' : '−';
    const amountColor = tx.type === 'income' ? 'var(--spendy-success)' : 'var(--spendy-danger)';

    tr.innerHTML = `
      <td></td>
      <td></td>
      <td><span class="category-pill"></span></td>
      <td class="u-muted"></td>
      <td style="font-weight:700; color:${amountColor};"></td>
      <td>
        <div class="row-actions">
          <button type="button" class="row-action-btn" data-action="edit" aria-label="Edit">${icons.edit}</button>
          <button type="button" class="row-action-btn danger" data-action="delete" aria-label="Delete">${icons.trash}</button>
        </div>
      </td>
    `;

    tr.children[0].textContent = formatDateShort(tx.transaction_date);
    tr.children[1].textContent = tx.title;
    tr.querySelector('.category-pill').textContent = label ?? 'Other';
    tr.children[3].textContent = tx.description ?? '—';
    tr.children[4].textContent = `${sign} ${formatCurrency(tx.amount, currency)}`;

    tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
      openTransactionModal({ userId: currentUser.id, transaction: tx, onSaved: loadPage });
    });
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(tx));

    tbody.appendChild(tr);
  }
}

async function handleDelete(tx) {
  const confirmed = window.confirm(`Delete "${tx.title}"? This can't be undone.`);
  if (!confirmed) return;

  try {
    await deleteTransaction(tx.id);
    toast.success('Transaction deleted.');
    // If we just deleted the last row on a page beyond page 1, step back.
    if (state.page > 1 && state.totalCount - 1 <= (state.page - 1) * PAGE_SIZE) {
      state.page -= 1;
    }
    await loadPage();
  } catch (err) {
    console.error('[Spendy] Failed to delete transaction:', err.message);
    toast.error('Could not delete transaction.');
  }
}

function renderPagination() {
  const container = document.getElementById('tx-pagination');
  if (!container) return;

  const totalPages = Math.max(Math.ceil(state.totalCount / PAGE_SIZE), 1);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.textContent = '‹';
  prevBtn.disabled = state.page === 1;
  prevBtn.addEventListener('click', () => { state.page -= 1; loadPage(); });
  container.appendChild(prevBtn);

  const windowStart = Math.max(1, state.page - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);

  for (let p = windowStart; p <= windowEnd; p++) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn${p === state.page ? ' is-active' : ''}`;
    btn.textContent = String(p);
    btn.addEventListener('click', () => { state.page = p; loadPage(); });
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.textContent = '›';
  nextBtn.disabled = state.page === totalPages;
  nextBtn.addEventListener('click', () => { state.page += 1; loadPage(); });
  container.appendChild(nextBtn);
}

async function handleExportCsv() {
  const btn = document.getElementById('export-csv-btn');
  btn.disabled = true;
  try {
    const rows = await fetchTransactionsForExport(currentUser.id, {
      search: state.search,
      type: state.type,
      category: state.category,
    });
    if (!rows.length) {
      toast.info('No transactions to export.');
      return;
    }
    exportTransactionsToCsv(rows);
    toast.success('CSV exported.');
  } catch (err) {
    console.error('[Spendy] CSV export failed:', err.message);
    toast.error('Could not export CSV.');
  } finally {
    btn.disabled = false;
  }
}

async function handleExportPdf() {
  const btn = document.getElementById('export-pdf-btn');
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const rows = await fetchTransactionsForExport(currentUser.id, {
      search: state.search,
      type: state.type,
      category: state.category,
    });
    if (!rows.length) {
      toast.info('No transactions to export.');
      return;
    }
    const { exportTransactionsToPdf } = await import('../utils/pdfExport.js');
    await exportTransactionsToPdf(rows, {
      userName: currentUser.user_metadata?.full_name ?? currentUser.email,
      currency,
    });
    toast.success('PDF exported.');
  } catch (err) {
    console.error('[Spendy] PDF export failed:', err.message);
    toast.error('Could not export PDF.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export PDF';
  }
}
