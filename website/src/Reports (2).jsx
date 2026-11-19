import React, { useEffect, useState } from 'react';
import { CalendarDays, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { deleteExpense, getReport, getRecentSales, getAllSales, money, startOfDay, endOfDay } from './api.js';
import {
  METHOD_COLORS, PERIOD_TITLE, ymd, parseYmd, fmtDateTime, PRESETS, presetFor, rangeLabel,
  printHtml, buildReportHtml, buildReceiptHtml,
} from './reportsUtils.js';
import {
  ExpenseModal, PaymentModal, DateModal, CancelModal, ManualSaleModal, FlowRow,
} from './ReportsModals.jsx';
import './reports.css';

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

