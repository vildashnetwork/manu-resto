// Save as: src/reports/salesReportPdf.js
import { Platform, Alert } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fcfa, fmtDateTime } from '../utils';

const REPORT_PAGE = { width: 595, height: 842 }; // A4 portrait in points

let logoPromise;
export function getReportLogoDataUri() {
  if (!logoPromise) {
    logoPromise = (async () => {
      const logo = Asset.fromModule(require('../../public/receipt-logo.png'));
      await logo.downloadAsync();
      if (!logo.localUri) throw new Error('The restaurant logo could not be loaded for the report.');
      const base64 = await FileSystem.readAsStringAsync(logo.localUri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:image/png;base64,${base64}`;
    })().catch((error) => {
      logoPromise = null;
      throw error;
    });
  }
  return logoPromise;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function safeFilePart(value, fallback) {
  return String(value || fallback)
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || fallback;
}

export function buildSaleReceiptHtml({ logoUri, sale }) {
  const items = (sale.items || []).map((item, index) => `
    <tr>
      <td><span class="idx">${String(index + 1).padStart(2, '0')}</span>${esc(item.product_name || item.name)}</td>
      <td class="n">${item.qty}</td>
      <td class="n">${fcfa(item.unit_price ?? item.unitPrice)}</td>
      <td class="n b">${fcfa(item.line_total ?? (item.qty * (item.unit_price ?? item.unitPrice ?? 0)))}</td>
    </tr>`).join('');
  const generated = fmtDateTime(sale.created_at);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(sale.receipt_no || 'Sales receipt')}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #202a23; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #c49b3c; }
  img { width: 76px; height: 76px; object-fit: contain; }
  h1 { margin: 0; color: #123a2b; font-family: Georgia, 'Times New Roman', serif; font-size: 25px; }
  .sub { margin: 5px 0 0; color: #69736d; }
  h2 { margin: 22px 0 4px; color: #123a2b; font-size: 20px; }
  .meta { color: #69736d; line-height: 1.7; }
  table { width: 100%; margin-top: 20px; border-collapse: collapse; }
  th { padding: 9px 7px; color: #fff; background: #123a2b; text-align: left; }
  td { padding: 9px 7px; border-bottom: 1px solid #eeeae1; }
  th.n, td.n { text-align: right; white-space: nowrap; }
  .b { font-weight: 700; }
  .idx { display: inline-block; width: 26px; color: #a58a4b; font-size: 10px; }
  .totals { width: 270px; margin: 18px 0 0 auto; }
  .total { display: flex; justify-content: space-between; padding: 7px 0; }
  .grand { border-top: 2px solid #123a2b; color: #123a2b; font-size: 16px; font-weight: 800; }
  footer { margin-top: 30px; padding-top: 14px; border-top: 1px dashed #d9d3c6; color: #68736b; text-align: center; }
</style></head><body>
  <header><img src="${logoUri}" alt="Manu's Resto logo"><div><h1>Manu’s Resto</h1><p class="sub">Good food · Great drinks · Happy people</p></div></header>
  <h2>Sales receipt</h2>
  <div class="meta">Receipt: ${esc(sale.receipt_no || 'Manual sale')}<br>Date: ${esc(generated)}<br>Customer: ${esc(sale.customer_name || 'Walk-in')}</div>
  <table><thead><tr><th>Product</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
    <tbody>${items || '<tr><td colspan="4">No items</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="total grand"><span>Total</span><span>${fcfa(sale.total)}</span></div>
    <div class="total"><span>Amount paid</span><strong>${fcfa(sale.paid_amount || 0)}</strong></div>
    <div class="total"><span>Balance due</span><strong>${fcfa(sale.credit_amount || 0)}</strong></div>
  </div>
  <footer>Thank you for choosing Manu’s Resto!</footer>
</body></html>`;
}

/**
 * Builds the HTML of the sales report.
 * title: e.g. "Daily sales report" | "Weekly sales report" | "Monthly sales report"
 * periodLabel: e.g. "12 Oct 2026 – 18 Oct 2026"
 */
export function buildSalesReportHtml({ logoUri, title, periodLabel, report: r, sales }) {
  const completed = (sales || []).filter((x) => x.status !== 'cancelled');
  const cancelledCount = (sales || []).length - completed.length;
  const generated = fmtDateTime(new Date().toISOString());
  const paidShare = r.totalSales > 0 ? Math.round(((r.totalSales - r.creditSales) / r.totalSales) * 100) : 0;

  const methodRows = (r.byMethod || []).map((m) => `
    <tr><td>${esc(m.method)}</td><td class="n">${fcfa(m.sales)}</td><td class="n">${fcfa(m.repayments)}</td><td class="n b">${fcfa(m.sales + m.repayments)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No payments in this period</td></tr>';

  const productRows = (r.topProducts || []).map((p, i) => `
    <tr><td><span class="idx">${String(i + 1).padStart(2, '0')}</span>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n b">${fcfa(p.revenue)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">No sales in this period</td></tr>';

  const expenseRows = (r.expList || []).map((e) => `
    <tr><td>${esc(e.category)}${e.note ? `<div class="sub">${esc(e.note)}</div>` : ''}</td><td>${esc(fmtDateTime(e.created_at))}</td><td>${esc(e.method)}</td><td class="n b neg">−${fcfa(e.amount)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No expenses in this period</td></tr>';

  const saleRows = (sales || []).map((x) => {
    const cancelled = x.status === 'cancelled';
    return `<tr class="${cancelled ? 'cancelled' : ''}">
      <td>${esc(x.receipt_no)}</td>
      <td>${esc(fmtDateTime(x.created_at))}</td>
      <td>${esc(x.customer_name || 'Walk-in')}</td>
      <td class="n">${fcfa(x.total)}</td>
      <td class="n">${cancelled ? '—' : fcfa(x.paid_amount || 0)}</td>
      <td class="n b">${cancelled ? 'Cancelled' : x.credit_amount > 0 ? fcfa(x.credit_amount) : 'Paid'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No sales in this period</td></tr>';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #202a23; font-family: Arial, Helvetica, sans-serif; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #c49b3c; }
  .logo { width: 92px; height: 92px; object-fit: contain; flex: 0 0 92px; }
  .eyebrow { margin: 0 0 4px; color: #a47c22; font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  h1 { margin: 0; color: #123a2b; font-family: Georgia, 'Times New Roman', serif; font-size: 25px; }
  .tagline { margin: 6px 0 0; color: #69736d; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; }
  .title-row { display: flex; justify-content: space-between; align-items: flex-end; margin: 18px 0 14px; gap: 12px; }
  h2 { margin: 0; color: #123a2b; font-size: 19px; }
  .period { margin-top: 4px; color: #89723a; font-size: 12px; font-weight: 700; }
  .gen { color: #778078; font-size: 9px; text-align: right; }
  .kpis { display: flex; gap: 8px; margin-bottom: 16px; }
  .kpi { flex: 1; padding: 11px 12px; background: #f6f5ef; border-radius: 7px; }
  .kpi.main { background: #123a2b; color: #fff; }
  .kpi .l { display: block; margin-bottom: 5px; font-size: 8px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #778078; }
  .kpi.main .l { color: rgba(255,255,255,.7); }
  .kpi .v { font-size: 14px; font-weight: 800; white-space: nowrap; }
  h3 { margin: 20px 0 8px; color: #123a2b; font-size: 12px; text-transform: uppercase; letter-spacing: .7px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; background: #123a2b; color: #fff; }
  th { padding: 8px; font-size: 8.5px; letter-spacing: .5px; text-align: left; text-transform: uppercase; }
  th.n, td.n { text-align: right; white-space: nowrap; }
  td { padding: 8px; border-bottom: 1px solid #eeeae1; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) { background: #fbfaf7; }
  .b { font-weight: 700; }
  .neg { color: #b3402e; }
  .sub { margin-top: 2px; color: #778078; font-size: 9px; }
  .idx { display: inline-block; width: 22px; color: #a58a4b; font-size: 9px; }
  .empty { padding: 14px 8px; color: #778078; text-align: center; }
  tr.cancelled td { color: #9aa29c; text-decoration: line-through; }
  .flow { width: 100%; }
  .flow td { padding: 7px 8px; }
  .net td { border-top: 2px solid #123a2b; border-bottom: 0; font-size: 13px; font-weight: 800; color: #123a2b; background: #fff6e5; }
  .split { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #efebe0; margin: 4px 0 6px; }
  .split .p { background: #2f8f5b; }
  .split .c { background: #d99a2b; }
  .legend { color: #626d65; font-size: 10px; }
  .note { margin-top: 8px; color: #778078; font-size: 9px; }
  .footer { margin-top: 26px; padding-top: 12px; border-top: 1px dashed #d9d3c6; color: #68736b; font-size: 9px; line-height: 1.6; text-align: center; }
  .thanks { display: block; margin-bottom: 3px; color: #123a2b; font-family: Georgia, 'Times New Roman', serif; font-size: 14px; font-weight: 700; }
</style></head><body>
  <header class="brand"><img class="logo" src="${logoUri}" alt="Manu's Resto logo"><div>
    <p class="eyebrow">Good food · Great drinks · Happy people</p><h1>Manu’s Resto</h1>
    <p class="tagline">Business report</p></div></header>

  <section class="title-row">
    <div><h2>${esc(title)}</h2><div class="period">${esc(periodLabel)}</div></div>
    <div class="gen">Generated<br>${esc(generated)}</div>
  </section>

  <section class="kpis">
    <div class="kpi main"><span class="l">Total sales · ${r.salesCount}</span><span class="v">${fcfa(r.totalSales)}</span></div>
    <div class="kpi"><span class="l">Collected</span><span class="v">${fcfa(r.cashFromSales)}</span></div>
    <div class="kpi"><span class="l">On credit</span><span class="v">${fcfa(r.creditSales)}</span></div>
    <div class="kpi"><span class="l">Expenses</span><span class="v">${fcfa(r.expenses)}</span></div>
  </section>

  <div class="split">${r.totalSales > 0 ? `<div class="p" style="flex:${Math.max(paidShare, 0.0001)}"></div><div class="c" style="flex:${Math.max(100 - paidShare, 0.0001)}"></div>` : ''}</div>
  <div class="legend">Paid now ${paidShare}% · On credit ${r.totalSales > 0 ? 100 - paidShare : 0}%</div>

  <h3>Cash flow</h3>
  <table class="flow"><tbody>
    <tr><td>Collected from these sales</td><td class="n b">+${fcfa(r.cashFromSales)}</td></tr>
    <tr><td>Debt recovered (old credit)</td><td class="n b">+${fcfa(r.debtRecovered)}</td></tr>
    <tr><td>Expenses paid</td><td class="n b neg">−${fcfa(r.expenses)}</td></tr>
    <tr class="net"><td>Net cash movement</td><td class="n">${r.netCashMovement < 0 ? '−' : ''}${fcfa(Math.abs(r.netCashMovement))}</td></tr>
  </tbody></table>
  <div class="note">Cash movement is not profit. Estimated gross profit: <strong>${fcfa(r.grossProfitEstimate)}</strong> · Owed by customers: <strong>${fcfa(r.outstandingDebt)}</strong> (${r.debtorCount} ${r.debtorCount === 1 ? 'customer' : 'customers'})</div>

  <h3>By payment method</h3>
  <table><thead><tr><th>Method</th><th class="n">Sales</th><th class="n">Repayments</th><th class="n">Total</th></tr></thead><tbody>${methodRows}</tbody></table>

  <h3>Best sellers</h3>
  <table><thead><tr><th>Product</th><th class="n">Qty sold</th><th class="n">Revenue</th></tr></thead><tbody>${productRows}</tbody></table>

  <h3>Expenses</h3>
  <table><thead><tr><th>Category</th><th>Date</th><th>Paid with</th><th class="n">Amount</th></tr></thead><tbody>${expenseRows}</tbody></table>

  <h3>Sales list · ${completed.length} ${completed.length === 1 ? 'sale' : 'sales'}${cancelledCount ? ` · ${cancelledCount} cancelled` : ''}</h3>
  <table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>${saleRows}</tbody></table>

  <footer class="footer"><span class="thanks">Thank you for choosing Manu’s Resto!</span>Good food · Great drinks · Happy people</footer>
</body></html>`;
}

/** Creates the PDF and either saves it (download) or opens the share sheet. */
export async function savePdf({ html, fileName, share = false }) {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html, ...REPORT_PAGE });
    return;
  }
  const file = await Print.printToFileAsync({
    html,
    ...REPORT_PAGE,
    ...(Platform.OS === 'android' ? { base64: true } : {}),
  });

  if (!FileSystem.documentDirectory) throw new Error('The app document folder is unavailable.');
  const shareUri = `${FileSystem.documentDirectory}${fileName}`;

  if (Platform.OS === 'android') {
    if (!file.base64) throw new Error('The PDF could not be prepared for saving.');
    if (share) {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await FileSystem.writeAsStringAsync(shareUri, file.base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', dialogTitle: fileName });
      return;
    }
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Download cancelled', 'Choose a folder to save the report PDF.');
      return;
    }
    const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, fileName, 'application/pdf');
    await FileSystem.StorageAccessFramework.writeAsStringAsync(savedUri, file.base64, { encoding: FileSystem.EncodingType.Base64 });
    Alert.alert('Report downloaded', `Saved as ${fileName}`);
    return;
  }

  // iOS: the share sheet offers "Save to Files" for downloading
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await FileSystem.copyAsync({ from: file.uri, to: shareUri });
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', dialogTitle: fileName });
}

export async function printHtml(html) {
  await Print.printAsync({ html, ...REPORT_PAGE });
}
