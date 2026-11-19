import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  addExpense, updateExpense, cancelSale, updateSalePayment, updateSaleDate, createSale, money,
} from './api.js';
import { METHODS, EXPENSE_CATEGORIES, ymd, addDays, readAmount, uid, stampFor } from './reportsUtils.js';

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
export function FlowRow({ label, value, sign, tone, bold }) {
  return <div className={`rp-flow ${bold ? 'bold' : ''}`}><span>{label}</span><b className={tone}>{sign}{money(value)}</b></div>;
}

/* ---------- modals ---------- */
export function ExpenseModal({ expense, onClose, onSaved }) {
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

export function PaymentModal({ sale, onClose, onSaved }) {
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

export function DateModal({ sale, onClose, onSaved }) {
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

export function CancelModal({ sale, onClose, onSaved }) {
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

export function ManualSaleModal({ products, customers, onClose, onSaved }) {
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

