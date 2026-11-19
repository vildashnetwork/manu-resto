import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, BarChart3, Bell, Boxes, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, CreditCard, Home as HomeIcon, LogOut, Menu, Plus,
  RefreshCw, Search, Settings as SettingsIcon, ShoppingCart, Users,
  UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import {
  addStockMovement, createCustomer, createSale,
  endOfDay, getCustomers, getProducts, getRecentSales, getReport, getSettings,
  money, recordRepayment, startOfDay, updateSettings, sendTestEmail,
} from './api.js';
import Reports from './Reports.jsx';

const PAGES = [
  { id: 'Home', icon: HomeIcon }, { id: 'Sales', icon: ShoppingCart },
  { id: 'Customers', icon: Users }, { id: 'Stock', icon: Boxes },
  { id: 'Reports', icon: BarChart3 }, { id: 'Settings', icon: SettingsIcon },
];
const DEFAULT_NOTIFICATIONS = {
  lowStock: true, creditDebt: true, expenses: true, dailySummary: true,
  urgentDebt: true, outOfStock: true, sales: true, stock: true,
  customerPayments: true, noSales: true,
};
const NOTIFICATIONS = [
  ['sales', 'Sales recorded', 'App push when a new sale is saved.'],
  ['lowStock', 'Low stock alerts', 'Email and app push when tracked stock reaches its configured threshold.'],
  ['creditDebt', 'Customer debt increases', 'Email and app push when a credit sale or opening balance adds to debt.'],
  ['customerPayments', 'Customer repayments', 'App push when a customer payment is recorded.'],
  ['stock', 'Stock changes', 'App push when stock is added, removed, or adjusted.'],
  ['expenses', 'Expenses recorded', 'Email and app push when a new expense is entered.'],
  ['dailySummary', 'Hourly business summaries', 'Email sales, customer debt, stock, and expenses every hour.'],
  ['urgentDebt', 'Customer debt reminders', 'App push reminders while customer debt remains unpaid.'],
  ['outOfStock', 'Out-of-stock reminders', 'Email and app push reminders when tracked products run out.'],
  ['noSales', 'Days without sales', 'App push reminders after a full day without a recorded sale.'],
];
const METHODS = ['Cash', 'MTN MoMo', 'Xcash', 'Orange Money', 'Bank transfer'];
const uid = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'W';
const readAmount = (value) => Number.parseInt(String(value || '').replace(/[^0-9]/g, ''), 10) || 0;

function Brand() {
  return <div className="brand"><span className="brand-icon"><UtensilsCrossed size={19} /></span><span>Manu's <b>Resto</b><small>RESTAURANT MANAGER</small></span></div>;
}
function PageTitle({ eyebrow, title, children }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children && <div className="title-actions">{children}</div>}</div>;
}
function Stat({ title, value, note, icon: Icon, tone = 'green' }) {
  return <article className="stat"><div className="stat-heading">{title}<span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><strong>{value}</strong><small>{note}</small></article>;
}
function Button({ children, onClick, secondary = false, disabled = false, type = 'button' }) {
  return <button type={type} className={`button ${secondary ? 'secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Login({ onLogin }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState('');
  function submit(event) { event.preventDefault(); if (password === '123456') onLogin(); else setError('Incorrect password. Try again.'); }
  return <main className="login"><section className="login-hero"><Brand /><div><span className="eyebrow">RESTAURANT MANAGEMENT, MADE SIMPLE</span><h1>More time for<br />the <em>good stuff.</em></h1><p>Sales, customers and stock in one happy place. So you can spend more time doing what you love.</p></div><small>Made for the people who make every meal matter ✳</small></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="login-badge"><UtensilsCrossed size={21} /></span><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your restaurant</h2><p>Your dashboard is ready when you are.</p><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Enter your password" autoComplete="current-password" />{error && <span className="error-text">{error}</span>}<button className="button login-button" type="submit">Continue <ChevronRight size={17} /></button><small>Private workspace · Demo password configured</small></form></section></main>;
}
function SaleRow({ sale }) {
  const canceled = sale.status === 'cancelled';
  return <tr><td className="id-cell">{sale.receipt_no || sale.id}</td><td>{sale.customer_name || 'Walk-in'}</td><td>{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="amount-cell">{money(sale.total)}</td><td><span className={`pill ${canceled ? 'muted-pill' : sale.credit_amount > 0 ? 'credit-pill' : ''}`}>{canceled ? 'Cancelled' : sale.credit_amount > 0 ? `Unpaid ${money(sale.credit_amount)}` : 'Paid'}</span></td></tr>;
}
function Home({ data, navigate, loading }) {
  const r = data.report || {}; const low = data.products.filter((product) => product.tracked && product.low_stock_threshold > 0 && product.stock <= product.low_stock_threshold);
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  return <><PageTitle eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} title={`${greeting}, Manu 👋`}><Button onClick={() => navigate('Sales')}><Plus size={16} /> New sale</Button></PageTitle><section className="hero"><div><div className="hero-eyebrow">TODAY'S SALES · {r.salesCount || 0} ORDERS</div><strong>{money(r.totalSales)}</strong><div className="hero-metrics"><span><small>Collected</small><b>{money(r.cashFromSales)}</b></span><span><small>On credit</small><b>{money(r.creditSales)}</b></span><span><small>Debt recovered</small><b>{money(r.debtRecovered)}</b></span></div></div><span className="hero-mark">✳</span></section><div className="stats-grid"><Stat title="Collected today" value={money(r.cashFromSales)} note="Cash received from sales" icon={Wallet} /><Stat title="Outstanding debt" value={money(r.outstandingDebt)} note={`${r.debtorCount || 0} customers with open balance`} icon={CreditCard} tone="rose" /><Stat title="Spent today" value={money(r.expenses)} note="Recorded expenses" icon={CircleDollarSign} tone="orange" /><Stat title="Products" value={data.products.length} note={`${low.length} low-stock alerts`} icon={Boxes} tone="blue" /></div><div className="section-title"><div><h2>Recent sales</h2><p>Latest transactions from your live account</p></div><button className="link-button" onClick={() => navigate('Reports')}>Reports <ChevronRight size={15} /></button></div><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>TIME</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{data.sales.slice(0, 7).map((sale) => <SaleRow key={sale.id} sale={sale} />)}</tbody></table></div>{!data.sales.length && <div className="empty">{loading ? 'Loading sales…' : 'No sales recorded today.'}</div>}</section>{low.length > 0 && <section className="alert-list"><b><AlertCircle size={17} /> Low stock · {low.length}</b><span>{low.map((product) => `${product.name} (${product.stock})`).join(' · ')}</span><button className="link-button" onClick={() => navigate('Stock')}>Manage stock <ChevronRight size={15} /></button></section>}</>;
}
function Sales({ data, reload }) {
  const [query, setQuery] = useState(''); const [cart, setCart] = useState({}); const [customerId, setCustomerId] = useState('');
  const [paid, setPaid] = useState(''); const [method, setMethod] = useState('Cash'); const [busy, setBusy] = useState(false);
  const products = data.products.filter((product) => `${product.name} ${product.barcode || ''}`.toLowerCase().includes(query.toLowerCase()));
  const items = data.products.filter((product) => cart[product.id] > 0).map((product) => ({ ...product, qty: cart[product.id] }));
  const total = items.reduce((sum, product) => sum + product.price * product.qty, 0); const amountPaid = paid === '' ? total : readAmount(paid);
  async function checkout() {
    if (!items.length || busy) return;
    if (amountPaid < total && !customerId) { alert('Choose a customer for a sale with an unpaid balance.'); return; }
    if (amountPaid > total) { alert('Amount paid cannot exceed the sale total.'); return; }
    setBusy(true);
    try {
      await createSale({ idempotencyKey: uid(), items: items.map((product) => ({ productId: product.id, name: product.name, unitPrice: product.price, unitCost: product.cost || 0, qty: product.qty, tracked: product.tracked })), customerId: customerId || null, payments: amountPaid > 0 ? [{ method, amount: amountPaid }] : [] });
      setCart({}); setPaid(''); setCustomerId(''); await reload(); alert('Sale recorded successfully.');
    } catch (error) { alert(error.message || 'Could not record sale.'); } finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="RECORD AND REVIEW ORDERS" title="Sales"><Button secondary onClick={reload}><RefreshCw size={16} /> Refresh</Button></PageTitle><div className="stats-grid compact"><Stat title="Sales today" value={money(data.report?.totalSales)} note={`${data.report?.salesCount || 0} transactions`} icon={CircleDollarSign} /><Stat title="Collected" value={money(data.report?.cashFromSales)} note="Paid toward sales" icon={Wallet} tone="blue" /><Stat title="On credit" value={money(data.report?.creditSales)} note="Outstanding sales" icon={CreditCard} tone="rose" /></div><section className="panel list-panel"><div className="panel-heading"><div><h2>Today's sales</h2><p>Live records from the backend API</p></div><label className="search"><Search size={16} /><input placeholder="Search receipt or customer" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>TIME</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{data.sales.filter((sale) => `${sale.receipt_no} ${sale.customer_name || ''}`.toLowerCase().includes(query.toLowerCase())).map((sale) => <SaleRow key={sale.id} sale={sale} />)}</tbody></table></div>{!data.sales.length && <div className="empty">No sales recorded today.</div>}</section><section className="panel checkout"><div className="panel-heading"><div><h2>New sale</h2><p>Select real products, then record through the sales API.</p></div></div><label className="search product-search"><Search size={16} /><input placeholder="Filter products" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="product-grid">{products.map((product) => <button className="product-tile" key={product.id} onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))}><span>{product.image_url ? <img src={product.image_url} alt="" /> : <UtensilsCrossed size={19} />}</span><b>{product.name}</b><small>{money(product.price)} · {product.tracked ? `${product.stock ?? 0} in stock` : 'Not tracked'}</small>{cart[product.id] > 0 && <i>× {cart[product.id]}</i>}</button>)}</div><div className="checkout-controls"><label>Customer<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in / choose customer</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.balance > 0 ? ` · owes ${money(customer.balance)}` : ''}</option>)}</select></label><label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}>{METHODS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Amount paid<input type="number" min="0" value={paid} placeholder={String(total)} onChange={(event) => setPaid(event.target.value)} /></label><Button onClick={checkout} disabled={busy || !items.length}><CheckCircle2 size={16} /> {busy ? 'Saving…' : `Record · ${money(total)}`}</Button></div></section></>;
}
function Customers({ data, reload }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All');
  async function add() { const name = prompt('Customer name'); if (!name?.trim()) return; const phone = prompt('Phone (optional)') || ''; try { await createCustomer({ name, phone }); await reload(); } catch (error) { alert(error.message); } }
  async function repay(customer) { const amount = readAmount(prompt(`Repayment amount for ${customer.name} (FCFA)`)); if (!(amount > 0)) return; try { await recordRepayment({ customerId: customer.id, amount, method: 'Cash' }); await reload(); } catch (error) { alert(error.message); } }
  const customers = data.customers.filter((customer) => `${customer.name} ${customer.phone || ''} ${customer.code || ''}`.toLowerCase().includes(query.toLowerCase())).filter((customer) => filter === 'All' || customer.balance > 0);
  const debt = data.customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.balance) || 0), 0);
  return <><PageTitle eyebrow="CREDIT ACCOUNTS AND REGULARS" title="Customers"><Button onClick={add}><Plus size={16} /> Add customer</Button></PageTitle><div className="stats-grid compact"><Stat title="Customers" value={data.customers.length} note="Live customer accounts" icon={Users} /><Stat title="Total owed" value={money(debt)} note={`${data.customers.filter((customer) => customer.balance > 0).length} with open balance`} icon={CreditCard} tone="rose" /></div><section className="panel list-panel"><div className="panel-heading"><div><h2>Your customers</h2><p>Search accounts and record repayments</p></div><div className="filters"><label className="search"><Search size={16} /><input placeholder="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>Owing</option></select></div></div><div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PHONE / CODE</th><th>CREDIT LIMIT</th><th>OWED</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><span className="customer-name"><i>{initials(customer.name)}</i>{customer.name}</span></td><td>{[customer.phone, customer.code].filter(Boolean).join(' · ') || '—'}</td><td>{customer.credit_limit ? money(customer.credit_limit) : '—'}</td><td className={customer.balance > 0 ? 'debt' : ''}>{money(customer.balance)}</td><td>{customer.balance > 0 && <button className="small-action" onClick={() => repay(customer)}>Record repayment</button>}</td></tr>)}</tbody></table></div>{!customers.length && <div className="empty">No customers match your filters.</div>}</section></>;
}
function Stock({ data, reload }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('All'); const categories = ['All', ...new Set(data.products.map((product) => product.category).filter(Boolean))];
  async function adjust(product) { const qty = readAmount(prompt(`Add quantity to ${product.name} (${product.unit || 'units'})`)); if (!(qty > 0)) return; try { await addStockMovement({ productId: product.id, type: 'purchase', qty, note: 'Added from website' }); await reload(); } catch (error) { alert(error.message); } }
  const products = data.products.filter((product) => (category === 'All' || product.category === category) && `${product.name} ${product.barcode || ''}`.toLowerCase().includes(query.toLowerCase()));
  const tracked = data.products.filter((product) => product.tracked); const low = tracked.filter((product) => product.low_stock_threshold > 0 && product.stock <= product.low_stock_threshold);
  return <><PageTitle eyebrow="MENU AND INVENTORY" title="Stock"><Button secondary onClick={reload}><RefreshCw size={16} /> Refresh stock</Button></PageTitle><div className="stats-grid compact"><Stat title="Products" value={data.products.length} note="Menu items" icon={Boxes} /><Stat title="Tracked stock" value={tracked.length} note="Inventory-tracked items" icon={Wallet} tone="blue" /><Stat title="Low stock" value={low.length} note="At or below configured threshold" icon={AlertCircle} tone="rose" /></div><section className="panel list-panel"><div className="panel-heading"><div><h2>Inventory</h2><p>Manage quantities using the stock movement API</p></div><div className="filters"><label className="search"><Search size={16} /><input placeholder="Search product or barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>QUANTITY</th><th>STATUS</th><th /></tr></thead><tbody>{products.map((product) => { const isLow = product.tracked && product.low_stock_threshold > 0 && product.stock <= product.low_stock_threshold; return <tr key={product.id}><td><span className="customer-name">{product.image_url ? <img className="product-thumb" src={product.image_url} alt="" /> : <i><UtensilsCrossed size={15} /></i>}{product.name}</span></td><td>{product.category}</td><td>{money(product.price)}</td><td>{product.tracked ? `${product.stock} ${product.unit || ''}` : 'Not tracked'}</td><td><span className={`pill ${isLow ? 'credit-pill' : ''}`}>{product.tracked ? isLow ? 'Low stock' : 'In stock' : 'Not tracked'}</span></td><td>{product.tracked && <button className="small-action" onClick={() => adjust(product)}>Add stock</button>}</td></tr>; })}</tbody></table></div>{!products.length && <div className="empty">No products found.</div>}</section></>;
}
function Settings({ data, reload }) {
  const [email, setEmail] = useState(data.settings?.adminEmail || ''); const [notifications, setNotifications] = useState({ ...DEFAULT_NOTIFICATIONS, ...(data.settings?.notifications || {}) }); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data.settings) { setEmail(data.settings.adminEmail || ''); setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.settings.notifications }); } }, [data.settings]);
  async function save() { setBusy(true); try { await updateSettings({ adminEmail: email.trim(), notifications }); await reload(); alert('Notification settings saved.'); } catch (error) { alert(error.message); } finally { setBusy(false); } }
  async function test() { setBusy(true); try { const result = await sendTestEmail(); alert(`Test email sent to ${result.recipient}.`); } catch (error) { alert(error.message); } finally { setBusy(false); } }
  return <><PageTitle eyebrow="WORKSPACE PREFERENCES" title="Settings"><Button secondary onClick={test} disabled={busy}><Bell size={16} /> Send test email</Button><Button onClick={save} disabled={busy}><Check size={16} /> Save settings</Button></PageTitle><section className="panel settings-panel"><h2>Admin email</h2><p>This address receives the email notifications enabled below.</p><label className="settings-email">Notification email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label><div className="notification-list">{NOTIFICATIONS.map(([key, title, detail]) => <label className="notification-option" key={key}><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={Boolean(notifications[key])} onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))} /></la
