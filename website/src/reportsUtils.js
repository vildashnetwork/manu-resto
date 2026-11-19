import { money } from './api.js';

export const METHODS = ['Cash', 'MTN MoMo', 'Xcash', 'Orange Money', 'Bank transfer'];
export const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Salaries', 'Transport', 'Rent', 'Other'];
export const METHOD_COLORS = { Cash: '#2f7d4f', 'MTN MoMo': '#d9a400', Xcash: '#2b6cb0', 'Orange Money': '#e8710a', 'Bank transfer': '#6b46c1' };
export const PERIOD_TITLE = {
  Today: 'Daily sales report', Yesterday: 'Daily sales report',
  '7 days': 'Weekly sales report', '30 days': 'Monthly sales report',
  'This month': 'Monthly sales report', 'Last month': 'Monthly sales report',
};

/* ---------- helpers ---------- */
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => new Date(`${s}T00:00:00`);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const readAmount = (v) => Number.parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0;
export const uid = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const fmtDateTime = (v) => new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
// Past days are stamped at noon so they stay on that day in any time zone; today uses the current time.
export const stampFor = (day) => (day === ymd() ? Date.now() : new Date(`${day}T12:00:00`).getTime());
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PRESETS = {
  Today: () => [new Date(), new Date()],
  Yesterday: () => { const y = addDays(new Date(), -1); return [y, y]; },
  '7 days': () => [addDays(new Date(), -6), new Date()],
  '30 days': () => [addDays(new Date(), -29), new Date()],
  'This month': () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; },
  'Last month': () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; },
};
export const presetFor = (from, to) => Object.keys(PRESETS).find((k) => { const [a, b] = PRESETS[k](); return ymd(a) === from && ymd(b) === to; }) || null;
export const rangeLabel = (from, to) => {
  const f = (s) => parseYmd(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
};

export function printHtml(html) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) throw new Error('Allow pop-ups to print.');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}
export const PRINT_CSS = `body{font-family:Arial,sans-serif;color:#222;padding:24px}h1{margin:0 0 4px}h2{margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left;font-size:13px}td.r,th.r{text-align:right}.muted{color:#777;font-size:12px}`;

export function buildReportHtml({ title, label, r, sales }) {
  const rows = sales.map((s) => `<tr><td>${esc(s.receipt_no || s.id)}</td><td>${esc(fmtDateTime(s.created_at))}</td><td>${esc(s.customer_name || 'Walk-in')}</td><td class="r">${esc(money(s.total))}</td><td>${s.status === 'cancelled' ? 'Cancelled' : s.credit_amount > 0 ? `Unpaid ${esc(money(s.credit_amount))}` : 'Paid'}</td></tr>`).join('');
  const methods = r.byMethod.map((m) => `<tr><td>${esc(m.method)}</td><td class="r">${esc(money(m.sales))}</td><td class="r">${esc(money(m.repayments))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
<h1>Manu's Resto — ${esc(title)}</h1><div class="muted">${esc(label)}</div>
<h2>Summary</h2><table>
<tr><td>Total sales (${r.salesCount})</td><td class="r">${esc(money(r.totalSales))}</td></tr>
<tr><td>Collected from sales</td><td class="r">${esc(money(r.cashFromSales))}</td></tr>
<tr><td>On credit</td><td class="r">${esc(money(r.creditSales))}</td></tr>
<tr><td>Debt recovered</td><td class="r">${esc(money(r.debtRecovered))}</td></tr>
<tr><td>Expenses</td><td class="r">${esc(money(r.expenses))}</td></tr>
<tr><td><b>Net cash movement</b></td><td class="r"><b>${esc(money(r.netCashMovement))}</b></td></tr>
<tr><td>Gross profit (est.)</td><td class="r">${esc(money(r.grossProfitEstimate))}</td></tr></table>
<h2>By payment method</h2><table><tr><th>Method</th><th class="r">Sales</th><th class="r">Repayments</th></tr>${methods}</table>
<h2>Sales</h2><table><tr><th>Receipt</th><th>Date</th><th>Customer</th><th class="r">Total</th><th>Status</th></tr>${rows}</table>
</body></html>`;
}

export function buildReceiptHtml(sale) {
  const items = Array.isArray(sale.items) ? sale.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${esc(i.qty)}</td><td class="r">${esc(money(i.unitPrice ?? i.unit_price))}</td></tr>`).join('') : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.receipt_no || 'Receipt')}</title><style>${PRINT_CSS}body{max-width:420px}</style></head><body>
<h1>Manu's Resto</h1><div class="muted">Receipt ${esc(sale.receipt_no || sale.id)} · ${esc(fmtDateTime(sale.created_at))}</div>
<div>Customer: ${esc(sale.customer_name || 'Walk-in')}</div>
${items ? `<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th></tr>${items}</table>` : ''}
<table><tr><td>Total</td><td class="r"><b>${esc(money(sale.total))}</b></td></tr>
<tr><td>Paid</td><td class="r">${esc(money(sale.paid_amount))}</td></tr>
<tr><td>Balance due</td><td class="r">${esc(money(sale.credit_amount))}</td></tr></table>
<p class="muted">Thank you!</p></body></html>`;
}

