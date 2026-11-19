import React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { money } from './api.js';

export const METHODS = ['Cash', 'MTN MoMo', 'Xcash', 'Orange Money', 'Bank transfer'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'W';
export const readAmount = (value) => Number.parseInt(String(value || '').replace(/[^0-9]/g, ''), 10) || 0;

export function Brand() {
  return <div className="brand"><span className="brand-icon"><UtensilsCrossed size={19} /></span><span>Manu's <b>Resto</b><small>RESTAURANT MANAGER</small></span></div>;
}
export function PageTitle({ eyebrow, title, children }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children && <div className="title-actions">{children}</div>}</div>;
}
export function Stat({ title, value, note, icon: Icon, tone = 'green' }) {
  return <article className="stat"><div className="stat-heading">{title}<span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><strong>{value}</strong><small>{note}</small></article>;
}
export function Button({ children, onClick, secondary = false, disabled = false, type = 'button' }) {
  return <button type={type} className={`button ${secondary ? 'secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function SaleRow({ sale }) {
  const canceled = sale.status === 'cancelled';
  return <tr><td className="id-cell">{sale.receipt_no || sale.id}</td><td>{sale.customer_name || 'Walk-in'}</td><td>{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="amount-cell">{money(sale.total)}</td><td><span className={`pill ${canceled ? 'muted-pill' : sale.credit_amount > 0 ? 'credit-pill' : ''}`}>{canceled ? 'Cancelled' : sale.credit_amount > 0 ? `Unpaid ${money(sale.credit_amount)}` : 'Paid'}</span></td></tr>;
}
