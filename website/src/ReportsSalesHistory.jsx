import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronDown, X } from 'lucide-react';
import { cancelSale, getRecentSales, money, startOfDay, endOfDay } from './api';

const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const saleTime = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Sales history panel used below the report summaries, following the mobile Reports screen. */
export default function ReportsSalesHistory({ date, reload }) {
  const [sales, setSales] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedDate = date ? new Date(`${date}T00:00:00`) : new Date();

  async function loadSales() {
    setLoading(true);
    try {
      setSales(await getRecentSales(100, startOfDay(selectedDate), endOfDay(selectedDate)));
    } catch (error) {
      alert(error.message || 'Could not load sales history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSales(); }, [date]);

  const visible = sales.filter((sale) => filter === 'All' || (
    sale.status === 'completed' && (filter === 'Paid' ? Number(sale.credit_amount) === 0 : Number(sale.credit_amount) > 0)
  ));

  async function submitCancellation(event) {
    event.preventDefault();
    if (!cancelTarget || !reason.trim() || busy) return;
    setBusy(true);
    try {
      await cancelSale(cancelTarget.id, reason);
      setCancelTarget(null);
      setReason('');
      await loadSales();
      await reload?.();
    } catch (error) {
      alert(error.message || 'Could not cancel this sale.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel report-sales-history">
    <div className="panel-heading">
      <div><h2>Sales history <span className="count-pill">{visible.length}</span></h2><p>Sales recorded for {selectedDate.toLocaleDateString()}</p></div>
      <label className="date-control"><CalendarDays size={16} /><input aria-label="Sales history date" type="date" value={date || dateValue(new Date())} onChange={(event) => reload?.(event.target.value)} /></label>
    </div>
    <div className="report-sales-filters" role="group" aria-label="Filter sales">
      {['All', 'Paid', 'Unpaid'].map((option) => <button key={option} type="button" className={`button ${filter === option ? '' : 'secondary'}`} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option}</button>)}
    </div>
    {loading ? <div className="empty">Loading sales…</div> : visible.length === 0 ? <div className="empty">No sales match these filters.</div> : <div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>TIME</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      {visible.map((sale) => {
        const cancelled = sale.status === 'cancelled';
        return <tr key={sale.id}>
          <td className="id-cell">{sale.receipt_no || sale.id}</td>
          <td>{sale.customer_name || 'Walk-in'}</td>
          <td>{saleTime(sale.created_at)}</td>
          <td className={cancelled ? 'muted-amount' : 'amount-cell'}>{money(sale.total)}</td>
          <td><span className={`pill ${cancelled ? 'muted-pill' : Number(sale.credit_amount) > 0 ? 'credit-pill' : ''}`}>{cancelled ? 'Cancelled' : Number(sale.credit_amount) > 0 ? `Unpaid ${money(sale.credit_amount)}` : 'Paid'}</span>{sale.cancel_reason && <small className="cancel-reason">Reason: {sale.cancel_reason}</small>}</td>
          <td>{!cancelled && <button className="small-action danger-action" type="button" onClick={() => { setCancelTarget(sale); setReason(''); }}>Cancel sale</button>}</td>
        </tr>;
      })}
    </tbody></table></div>}
    {cancelTarget && <div className="sale-cancel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCancelTarget(null); }}>
      <form className="sale-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title" onSubmit={submitCancellation}>
        <div className="sale-cancel-heading"><div><h3 id="cancel-sale-title">Cancel sale</h3><p>{cancelTarget.receipt_no || cancelTarget.id} · {money(cancelTarget.total)}</p></div><button className="icon-button" type="button" aria-label="Close" disabled={busy} onClick={() => setCancelTarget(null)}><X size={18} /></button></div>
        <p className="sale-cancel-note">The sale stays on record as cancelled. Stock is restored and any credit is reversed. A reason is required.</p>
        <label className="sale-cancel-label" htmlFor="sale-cancel-reason">Reason</label><textarea id="sale-cancel-reason" autoFocus required value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
        <div className="sale-cancel-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => setCancelTarget(null)}>Keep sale</button><button className="button danger-button" type="submit" disabled={busy || !reason.trim()}><Check size={16} />{busy ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
      </form>
    </div>}
  </section>;
}
