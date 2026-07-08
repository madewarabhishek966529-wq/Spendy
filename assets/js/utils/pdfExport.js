// ============================================================================
// Spendy — PDF Export
// Loaded lazily (only when the user actually clicks "Export PDF") so the
// jsPDF + autoTable bundles never cost anything on pages that don't need
// them. Same CDN-ESM pattern as services/supabaseClient.js.
// ============================================================================

import { formatCurrency, formatDateLong } from './formatters.js';

let jsPDFModulePromise = null;

function loadJsPdf() {
  if (!jsPDFModulePromise) {
    jsPDFModulePromise = Promise.all([
      import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'),
      import('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.3/+esm'),
    ]).then(([jsPdfModule, autoTableModule]) => ({
      jsPDF: jsPdfModule.jsPDF,
      autoTable: autoTableModule.default,
    }));
  }
  return jsPDFModulePromise;
}

/**
 * @param {Array<{type:string,title:string,amount:number,category?:string,source?:string,description?:string,transaction_date:string}>} transactions
 * @param {{ userName?: string, currency?: string }} [meta]
 */
export async function exportTransactionsToPdf(transactions, meta = {}, filename = 'spendy-transactions.pdf') {
  const { jsPDF, autoTable } = await loadJsPdf();
  const { userName = '', currency = 'INR' } = meta;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(16, 185, 129); // brand emerald
  doc.text('Spendy', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  const subtitle = userName ? `Transaction history for ${userName}` : 'Transaction history';
  doc.text(`${subtitle} · Generated ${formatDateLong(new Date())}`, 40, 62);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`Total income: ${formatCurrency(totalIncome, currency)}`, 40, 82);
  doc.text(`Total expense: ${formatCurrency(totalExpense, currency)}`, 220, 82);
  doc.text(`Net: ${formatCurrency(totalIncome - totalExpense, currency)}`, 400, 82);

  autoTable(doc, {
    startY: 100,
    head: [['Date', 'Type', 'Title', 'Category / Source', 'Description', 'Amount']],
    body: transactions.map((tx) => [
      tx.transaction_date,
      tx.type === 'income' ? 'Income' : 'Expense',
      tx.title,
      tx.type === 'income' ? (tx.source ?? '') : (tx.category ?? ''),
      tx.description ?? '',
      formatCurrency(tx.amount, currency),
    ]),
    styles: { fontSize: 8.5, cellPadding: 6 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 251] },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  });

  doc.save(filename);
}
