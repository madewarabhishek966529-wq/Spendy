// ============================================================================
// Spendy — CSV Export
// No library needed for CSV: build the string, escape it properly, and
// trigger a browser download via an object URL.
// ============================================================================

function escapeCsvField(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {Array<{type:string,title:string,amount:number,category?:string,source?:string,description?:string,transaction_date:string}>} transactions
 */
export function exportTransactionsToCsv(transactions, filename = 'spendy-transactions.csv') {
  const headers = ['Date', 'Type', 'Title', 'Category / Source', 'Description', 'Amount'];
  const rows = transactions.map((tx) => [
    tx.transaction_date,
    tx.type,
    tx.title,
    tx.type === 'income' ? tx.source ?? '' : tx.category ?? '',
    tx.description ?? '',
    tx.amount,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  // Prepend a UTF-8 BOM so Excel renders the ₹ symbol and non-ASCII text correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
