import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import {
  addExpense, updateExpense, deleteExpense, cancelSale, updateSalePayment, updateSaleDate,
  createSale, getReport, getRecentSales, getAllSales, money, startOfDay, endOfDay,
} from './api.js';
import './reports.css';

const METHODS = ['Cash', 'MTN MoMo', 'Xcash', 'Orange Money', 'Bank transfer'];
const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Salaries', 'Transport', 'Rent', 'Other'];
const METHOD_COLORS = { Cash: '#2f7d4f', 'MTN MoMo': '#d9a400', Xcash: '#2b6cb0', 'Orange Money': '#e8710a', 'Bank transfer': '#6b46c1' };
const PERIOD_TITLE = {
  Today: 'Daily sales report', Yesterday: 'Daily sales report',
  '7 days': 'Weekly sales report', '30 days': 'Monthly sales report',
  'This month': 'Monthly sales report', 'Last month': 'Monthly sales report',
};

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => new Date(`${s}T00:00:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const readAmount = (v) => Number.parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0;
const uid = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fmtDateTime = (v) => new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
// Past days are stamped at noon so they stay on that day in any time zone; today uses the current time.
const stampFor = (day) => (day === ymd() ? Date.now() : new Date(`${day}T12:00:00`).getTime());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PRESETS = {
  Today: () => [new Date(), new Date()],
  Yesterday: () => { const y = addDays(new Date(), -1); return [y, y]; },
  '7 days': () => [addDays(new Date(), -6), new Date()],
  '30 days': () => [addDays(new Date(), -29), new Date()],
  'This month': () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; },
  'Last month': () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; },
};
const presetFor = (from, to) => Object.keys(PRESETS).find((k) => { const [a, b] = PRESETS[k](); return ymd(a) === from && ymd(b) === to; }) || null;
const rangeLabel = (from, to) => {
  const f = (s) => parseYmd(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
};

function printHtml(html) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) throw new Error('Allow pop-ups to print.');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}
const PRINT_CSS = `body{font-family:Arial,sans-serif;color:#222;padding:24px}h1{margin:0 0 4px}h2{margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left;font-size:13px}td.r,th.r{text-align:right}.muted{color:#777;font-size:12px}`;

function buildReportHtml({ title, label, r, sales }) {
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

function buildReceiptHtml(sale) {
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

/* ---------- small UI pieces ---------- */
function Modal({ title, subtitle, onClose, busy, children }) {
  return (
    <div className="sale-cancel-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sale-cancel-dialog rp-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sale-cancel-heading">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function MethodPicker({ value, onChange }) {
  return <div className="rp-chips">{METHODS.map((m) => <button key={m} type="button" className={`rp-chip ${value === m ? 'active' : ''}`} onClick={() => onChange(m)}>{m}</button>)}</div>;
}
function FlowRow({ label, value, sign, tone, bold }) {
  return <div className={`rp-flow ${bold ? 'bold' : ''}`}><span>{label}</span><b className={tone}>{sign}{money(value)}</b></div>;
}

/* ---------- modals ---------- */
function ExpenseModal({ expense, onClose, onSaved }) {
  const [cat, setCat] = useState(expense?.category || 'Supplies');
  const [method, setMethod] = useState(expense?.method || 'Cash');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [note, setNote] = useState(expense?.note || '');
  const [day, setDay] = useState(expense ? ymd(new Date(expense.created_at)) : ymd());
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!day || day > ymd()) { alert('Pick a valid date that is not in the future.'); return; }
    setBusy(true);
    try {
      const body = { category: cat, amount: readAmount(amount), method, note, createdAt: stampFor(day) };
      if (expense) await updateExpense(expense.id, body); else await addExpense(body);
      onSaved();
    } catch (err) { alert(err.message || 'Could not save expense.'); } finally { setBusy(false); }
  }
  return (
    <Modal title={expense ? 'Edit expense' : 'New expense'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="rp-form">
        <label>Date<input type="date" max={ymd()} value={day} onChange={(e) => setDay(e.target.value)} required /></label>
        <label>Category<select value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Amount (FCFA)<input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
        <div className="rp-label">Paid with</div><MethodPicker value={method} onChange={setMethod} />
        <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="sale-cancel-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Close</button>
          <button className="button" type="submit" disabled={busy || readAmount(amount) <= 0}><Check size={16} />{busy ? 'Saving…' : expense ? 'Save changes' : 'Save expense'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({ sale, onClose, onSaved }) {
  const [paid, setPaid] = useState(String(sale.paid_amount || 0));
  const [method, setMethod] = useState(METHODS.includes(sale.payment_method) ? sale.payment_method : 'Cash');
  const [busy, setBusy] = useState(false);
  const amount = readAmount(paid);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (amount > sale.total) { alert('The paid amount cannot be greater than the sale total.'); return; }
    setBusy(true);
    try {
      await updateSalePayment(sale.id, { paidAmount: amount, method, idempotencyKey: `web-report-edit-${sale.id}-${Date.now()}` });
      onSaved();
    } catch (err) { alert(err.message || 'Could not update sale payment.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Edit amount paid" subtitle={`${sale.receipt_no || sale.id} · Sale total ${money(sale.total)}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="rp-form">
        <label>Amount paid (FCFA)<input type="number" min="0" max={sale.total} value={paid} onChange={(e) => setPaid(e.target.value)} required /></label>
        {amount < sale.total && <div className="rp-warn">Remaining credit: {money(sale.total - amount)}</div>}
        <div className="rp-label">Payment method for the corrected amount</div><MethodPicker value={method} onChange={setMethod} />
        <p className="rp-fine">The previous payment entries are kept and marked reversed, then the corrected amount is recorded. The change is written to the audit log.</p>
        <div className="sale-cancel-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Keep amount</button>
          <button className="button" type="submit" disabled={busy || amount > sale.total}><Check size={16} />{busy ? 'Saving…' : 'Save payment adjustment'}</button>
        </div>
      </form>
    </Modal>
  );
}

function DateModal({ sale, onClose, onSaved }) {
  const [day, setDay] = useState(ymd(new Date(sale.created_at)));
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!day || day > ymd()) { alert('Pick a valid date that is not in the future.'); return; }
    setBusy(true);
    try { await updateSaleDate(sale.id, stampFor(day)); onSaved(); }
    catch (err) { alert(err.message || 'Could not update sale date.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Edit sale date" subtitle={`${sale.receipt_no || sale.id} · ${sale.customer_name || 'Walk-in'}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="rp-form">
        <label>Sale date<input type="date" max={ymd()} value={day} onChange={(e) => setDay(e.target.value)} required /></label>
        <p className="rp-fine">The sale, its recorded payments, customer ledger entry, and stock movement dates will be updated together.</p>
        <div className="sale-cancel-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Close</button>
          <button className="button" type="submit" disabled={busy}><Check size={16} />{busy ? 'Saving…' : 'Save sale date'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({ sale, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    try { await cancelSale(sale.id, reason); onSaved(); }
    catch (err) { alert(err.message || 'Could not cancel this sale.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Cancel sale" subtitle={`${sale.receipt_no || sale.id} · ${money(sale.total)}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="rp-form">
        <p className="sale-cancel-note">The sale stays on record as cancelled. Stock is restored and any credit is reversed. A reason is required.</p>
        <label>Reason<textarea autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="sale-cancel-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Keep sale</button>
          <button className="button danger-button" type="submit" disabled={busy || !reason.trim()}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ManualSaleModal({ products, customers, onClose, onSaved }) {
  const [day, setDay] = useState(ymd());
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState({});
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  const shown = products.filter((p) => (category === 'All' || p.category === category) && `${p.name} ${p.barcode || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const lines = products.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] }));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const paidAmount = readAmount(paid);
  const change = (id, delta) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));

  async function save(allowOverLimit = false) {
    if (busy) return;
    if (!lines.length) { alert('Add at least one product to this sale.'); return; }
    if (paidAmount > total) { alert('The amount paid cannot be greater than the sale total.'); return; }
    if (paidAmount < total && !customerId) { alert('A customer is required when the sale has an unpaid balance.'); return; }
    if (!day || day > ymd()) { alert('Pick a valid date that is not in the future.'); return; }
    const createdAt = stampFor(day);
    setBusy(true);
    try {
      await createSale({
        idempotencyKey: uid(),
        items: lines.map((l) => ({ productId: l.id, name: l.name, unitPrice: l.price, unitCost: l.cost || 0, qty: l.qty, tracked: !!l.tracked })),
        customerId: customerId || null,
        payments: paidAmount > 0 ? [{ method, amount: paidAmount }] : [],
        createdAt, allowOverLimit,
      });
      onSaved(day);
    } catch (err) {
      if (err.code === 'CREDIT_LIMIT' && err.details) {
        const { balance, limit, credit } = err.details;
        setBusy(false);
        if (window.confirm(`Credit limit exceeded.\nCurrent debt ${money(balance)} + this sale on credit ${money(credit)} exceeds the limit of ${money(limit)}.\n\nAuthorize anyway?`)) save(true);
        return;
      }
      alert(err.message || 'Could not record manual sale.');
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Record sale manually" onClose={onClose} busy={busy}>
      <div className="rp-form">
        <label>Sale date
          <input type="date" max={ymd()} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="rp-chips">
          <button type="button" className={`rp-chip ${day === ymd() ? 'active' : ''}`} onClick={() => setDay(ymd())}>Today</button>
          <button type="button" className={`rp-chip ${day === ymd(addDays(new Date(), -1)) ? 'active' : ''}`} onClick={() => setDay(ymd(addDays(new Date(), -1)))}>Yesterday</button>
        </div>
        <label>Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in sale</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.balance > 0 ? ` · owes ${money(c.balance)}` : ''}</option>)}
          </select>
        </label>
        <div className="rp-row">
          <input placeholder="Search product or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="rp-products">
          {shown.map((p) => (
            <div key={p.id} className="rp-product">
              <div><b>{p.name}</b><small>{p.category} · {money(p.price)}</small></div>
              <div className="rp-qty">
                <button type="button" className="small-action" disabled={!cart[p.id]} onClick={() => change(p.id, -1)}>−</button>
                <span>{cart[p.id] || 0}</span>
                <button type="button" className="small-action" onClick={() => change(p.id, 1)}>+</button>
              </div>
            </div>
          ))}
          {!shown.length && <div className="empty">No products match your filters.</div>}
        </div>
        <div className="rp-label">Selected items · {money(total)}</div>
        {lines.map((l) => <div key={l.id} className="rp-flow"><span>{l.qty} × {l.name}</span><b>{money(l.qty * l.price)}</b></div>)}
        <label>Amount paid (FCFA)<input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
        <div className="rp-fine">Balance due: {money(Math.max(0, total - paidAmount))}</div>
        <div className="rp-label">Payment method</div><MethodPicker value={method} onChange={setMethod} />
        <div className="sale-cancel-actions">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Close</button>
          <button className="button" type="button" disabled={busy || !lines.length || paidAmount > total} onClick={() => save(false)}><Check size={16} />{busy ? 'Recording…' : `Record sale · ${money(total)}`}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- page ---------- */
export default function Reports({ data, reload }) {
  const [range, setRange] = useState({ from: ymd(), to: ymd() });
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState('All');
  const [exporting, setExporting] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(null);
  const [modal, setModal] = useState(null); // { type, expense?, sale? }

  const activeKey = presetFor(range.from, range.to);
  const periodTitle = PERIOD_TITLE[activeKey] || 'Sales report';
  const fromIso = startOfDay(parseYmd(range.from));
  const toIso = endOfDay(parseYmd(range.to));

  useEffect(() => {
    let stale = false;
    setLoading(true);
    Promise.all([getReport(fromIso, toIso), getRecentSales(100, fromIso, toIso)])
      .then(([report, sales]) => { if (!stale) setD({ report, sales }); })
      .catch((e) => { if (!stale) alert(e.message || 'Could not load report.'); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [range.from, range.to, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { setTick((t) => t + 1); reload?.(); };
  const closeAnd = () => { setModal(null); refresh(); };
  const quick = (key) => { const [a, b] = PRESETS[key](); setRange({ from: ymd(a), to: ymd(b) }); };
  const setFrom = (v) => v && setRange((r) => ({ from: v, to: v > r.to ? v : r.to }));
  const setTo = (v) => v && setRange((r) => ({ from: v < r.from ? v : r.from, to: v }));

  async function exportReport() {
    if (!d?.report || exporting) return;
    setExporting(true);
    try {
      const sales = await getAllSales(fromIso, toIso);
      printHtml(buildReportHtml({ title: periodTitle, label: rangeLabel(range.from, range.to), r: d.report, sales }));
    } catch (e) { alert(e.message || 'Cannot print report.'); } finally { setExporting(false); }
  }
  function printReceipt(sale) {
    setReceiptBusy(sale.id);
    try { printHtml(buildReceiptHtml(sale)); } catch (e) { alert(e.message); } finally { setReceiptBusy(null); }
  }
  async function removeExpense(e) {
    if (!window.confirm(`Delete the ${e.category} expense of ${money(e.amount)}?`)) return;
    try { await deleteExpense(e.id); refresh(); } catch (err) { alert(err.message || 'Cannot delete expense.'); }
  }

  const r = d?.report;
  const sales = d?.sales ?? [];
  const visible = sales.filter((s) => filter === 'All' || (s.status === 'completed' && (filter === 'Paid' ? Number(s.credit_amount) === 0 : Number(s.credit_amount) > 0)));
  const maxMethod = Math.max(1, ...(r?.byMethod ?? []).map((m) => m.sales + m.repayments));
  const maxProduct = Math.max(1, ...(r?.topProducts ?? []).map((p) => p.qty));
  const paidShare = r && r.totalSales > 0 ? Math.round(((r.totalSales - r.creditSales) / r.totalSales) * 100) : 0;

  return (
    <>
      <div className="page-title">
        <div><div className="eyebrow">BUSINESS SUMMARY</div><h1>Reports</h1></div>
        <div className="title-actions">
          <label className="date-control"><CalendarDays size={16} /><input aria-label="From date" type="date" max={ymd()} value={range.from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="date-control"><CalendarDays size={16} /><input aria-label="To date" type="date" max={ymd()} value={range.to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="button secondary" onClick={exportReport} disabled={exporting || loading || !r}><Printer size={16} /> {exporting ? 'Preparing…' : 'Print report'}</button>
          <button type="button" className="button" onClick={() => setModal({ type: 'expense' })}><Plus size={16} /> Add expense</button>
        </div>
      </div>

      <div className="rp-quick">
        {Object.keys(PRESETS).map((k) => <button key={k} type="button" className={`rp-chip ${activeKey === k ? 'active' : ''}`} onClick={() => quick(k)}>{k}</button>)}
        <span className="rp-range">{rangeLabel(range.from, range.to)}</span>
      </div>

      {!r ? <div className="empty">{loading ? 'Loading report…' : 'No report available.'}</div> : (
        <>
          <section className="hero report-hero">
            <div>
              <div className="hero-eyebrow">TOTAL SALES · {r.salesCount} {r.salesCount === 1 ? 'SALE' : 'SALES'}</div>
              <strong>{money(r.totalSales)}</strong>
              <div className="hero-metrics">
                <span><small>Collected</small><b>{money(r.cashFromSales)}</b></span>
                <span><small>On credit</small><b>{money(r.creditSales)}</b></span>
                <span><small>Expenses</small><b>{money(r.expenses)}</b></span>
              </div>
            </div>
            <span className="hero-mark">✳</span>
          </section>

          <section className="panel rp-card">
            <h2 className="rp-cap">Sales entered after the fact?</h2>
            <p className="rp-fine">Record a sale by hand for a selected day. Pages of the paper sales book can be typed in the same way.</p>
            <button type="button" className="button secondary" onClick={() => setModal({ type: 'manual' })}><Plus size={16} /> Type a sale</button>
          </section>

          <div className="rp-grid2">
            <section className="panel rp-card">
              <h2 className="rp-cap">How sales were paid</h2>
              <div className="rp-split">
                {r.totalSales > 0 && <><div style={{ flex: Math.max(paidShare, 0.0001), background: '#2f7d4f' }} /><div style={{ flex: Math.max(100 - paidShare, 0.0001), background: '#e0a100' }} /></>}
              </div>
              <div className="rp-legend"><span><i style={{ background: '#2f7d4f' }} />Paid now {paidShare}%</span><span><i style={{ background: '#e0a100' }} />On credit {r.totalSales > 0 ? 100 - paidShare : 0}%</span></div>
            </section>

            <section className="panel rp-card">
              <h2 className="rp-cap">Cash flow · FCFA</h2>
              <FlowRow label="Collected from these sales" value={r.cashFromSales} sign="+" tone="pos" />
              <FlowRow label="Debt recovered (old credit)" value={r.debtRecovered} sign="+" tone="pos" />
              <FlowRow label="Expenses paid" value={r.expenses} sign="−" tone="neg" />
              <hr />
              <FlowRow bold label="Net cash movement" value={Math.abs(r.netCashMovement)} sign={r.netCashMovement < 0 ? '−' : ''} tone={r.netCashMovement < 0 ? 'neg' : 'pos'} />
              <p className="rp-fine">Cash movement is not profit. Opening cash and withdrawals are not included.</p>
            </section>
          </div>

          <div className="stats-grid compact">
            <article className="stat"><div className="stat-heading">Gross profit (est.)</div><strong>{money(r.grossProfitEstimate)}</strong><small>Sales minus product cost</small></article>
            <article className="stat"><div className="stat-heading">Owed to you · {r.debtorCount}</div><strong>{money(r.outstandingDebt)}</strong><small>Open customer balances</small></article>
          </div>

          <section className="panel rp-card">
            <h2 className="rp-cap">By payment method</h2>
            {!r.byMethod.length && <div className="empty">No payments in this period.</div>}
            {r.byMethod.map((m) => {
              const t = m.sales + m.repayments; const c = METHOD_COLORS[m.method] || '#2f7d4f';
              return <div key={m.method} className="rp-bar"><div className="rp-barhead"><b>{m.method}</b><b>{money(t)}</b></div>
                <div className="rp-track"><div style={{ width: `${(t / maxMethod) * 100}%`, background: c }} /></div>
                <small>Sales {money(m.sales)} · Repayments {money(m.repayments)}</small></div>;
            })}
            <p className="rp-fine">Expected cash from movements: <b>{money(r.expectedCash)}</b>. Add opening cash, then compare with the cash counted.</p>
          </section>

          <section className="panel rp-card">
            <h2 className="rp-cap">Best sellers</h2>
            {!r.topProducts.length && <div className="empty">No sales in this period.</div>}
            {r.topProducts.map((p, i) => (
              <div key={p.name} className="rp-bar"><div className="rp-barhead"><b>{i + 1}. {p.name}</b><b>{p.qty} sold</b></div>
                <div className="rp-track"><div style={{ width: `${(p.qty / maxProduct) * 100}%`, background: '#d9a400' }} /></div>
                <small>{money(p.revenue)}</small></div>
            ))}
          </section>

          <section className="panel rp-card">
            <div className="panel-heading"><div><h2>Expenses</h2><p>Recorded in this period</p></div>
              <button type="button" className="small-action" onClick={() => setModal({ type: 'expense' })}>+ Add expense</button></div>
            {!r.expList.length && <div className="empty">No expenses in this period.</div>}
            {r.expList.map((e) => (
              <div key={e.id} className="rp-expense">
                <div><b>{e.category}</b><small>{fmtDateTime(e.created_at)} · {e.method}{e.note ? ` · ${e.note}` : ''}</small></div>
                <div className="rp-expense-right">
                  <b className="neg">−{money(e.amount)}</b>
                  <div className="history-actions">
                    <button type="button" className="small-action" onClick={() => setModal({ type: 'expense', expense: e })}><Pencil size={13} /> Edit</button>
                    <button type="button" className="small-action danger-action" onClick={() => removeExpense(e)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="panel report-sales-history rp-card">
            <div className="panel-heading"><div><h2>Sales history <span className="count-pill">{visible.length}</span></h2><p>Latest 100 sales in this period</p></div></div>
            <div className="report-sales-filters" role="group" aria-label="Filter sales">
              {['All', 'Paid', 'Unpaid'].map((o) => <button key={o} type="button" className={`button ${filter === o ? '' : 'secondary'}`} aria-pressed={filter === o} onClick={() => setFilter(o)}>{o}</button>)}
            </div>
            {!visible.length ? <div className="empty">No sales match these filters.</div> : (
              <div className="table-scroll"><table>
                <thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>DATE / TIME</th><th>TOTAL</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                <tbody>{visible.map((s) => {
                  const cancelled = s.status === 'cancelled';
                  return (
                    <tr key={s.id}>
                      <td className="id-cell">{s.receipt_no || s.id}</td>
                      <td>{s.customer_name || 'Walk-in'}{s.cancel_reason ? <small className="rp-reason"><br />Reason: {s.cancel_reason}</small> : null}</td>
                      <td>{fmtDateTime(s.created_at)}</td>
                      <td className={cancelled ? 'muted-amount' : 'amount-cell'}>{money(s.total)}</td>
                      <td><span className={`pill ${cancelled ? 'muted-pill' : s.credit_amount > 0 ? 'credit-pill' : ''}`}>{cancelled ? 'Cancelled' : s.credit_amount > 0 ? `Unpaid ${money(s.credit_amount)}` : 'Paid'}</span></td>
                      <td>{!cancelled && <div className="history-actions">
                        <button type="button" className="small-action" onClick={() => setModal({ type: 'payment', sale: s })}>Edit paid</button>
                        <button type="button" className="small-action" onClick={() => setModal({ type: 'date', sale: s })}>Edit date</button>
                        <button type="button" className="small-action" disabled={receiptBusy === s.id} onClick={() => printReceipt(s)}>Print receipt</button>
                        <button type="button" className="small-action danger-action" onClick={() => setModal({ type: 'cancel', sale: s })}>Cancel sale</button>
                      </div>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}

      {modal?.type === 'expense' && <ExpenseModal expense={modal.expense} onClose={() => setModal(null)} onSaved={closeAnd} />}
      {modal?.type === 'payment' && <PaymentModal sale={modal.sale} onClose={() => setModal(null)} onSaved={closeAnd} />}
      {modal?.type === 'date' && <DateModal sale={modal.sale} onClose={() => setModal(null)} onSaved={closeAnd} />}
      {modal?.type === 'cancel' && <CancelModal sale={modal.sale} onClose={() => setModal(null)} onSaved={closeAnd} />}
      {modal?.type === 'manual' && <ManualSaleModal products={data?.products ?? []} customers={data?.customers ?? []} onClose={() => setModal(null)}
        onSaved={(day) => { setModal(null); setRange({ from: day, to: day }); setTick((t) => t + 1); reload?.(); }} />}
    </>
  );
}
