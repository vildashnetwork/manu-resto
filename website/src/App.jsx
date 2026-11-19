import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, BarChart3, Boxes, ChevronRight, Home as HomeIcon, LogOut, Menu,
  RefreshCw, Settings as SettingsIcon, ShoppingCart, Users, X,
} from 'lucide-react';
import { endOfDay, getCustomers, getProducts, getRecentSales, getReport, getSettings, startOfDay } from './api.js';
import { Brand } from './ui.jsx';
import Login from './Login.jsx';
import HomePage from './HomePage.jsx';
import SalesPage from './SalesPage.jsx';
import CustomersPage from './CustomersPage.jsx';
import StockPage from './StockPage.jsx';
import Reports from './Reports.jsx';
import SettingsPage from './SettingsPage.jsx';

const PAGES = [
  { id: 'Home', icon: HomeIcon }, { id: 'Sales', icon: ShoppingCart },
  { id: 'Customers', icon: Users }, { id: 'Stock', icon: Boxes },
  { id: 'Reports', icon: BarChart3 }, { id: 'Settings', icon: SettingsIcon },
];

function App() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem('manu-resto-auth') === 'true');
  const [page, setPage] = useState('Home'); const [drawer, setDrawer] = useState(false);
  const [data, setData] = useState({ products: [], customers: [], sales: [], report: null, settings: null });
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!auth) return;
    setLoading(true); setError('');
    try {
      const from = startOfDay(); const to = endOfDay();
      const [products, customers, sales, report, settings] = await Promise.all([getProducts(), getCustomers(), getRecentSales(100, from, to), getReport(from, to), getSettings()]);
      setData({ products, customers, sales, report, settings });
    } catch (e) { setError(e.message || 'Could not load data from the restaurant API.'); }
    finally { setLoading(false); }
  }, [auth]);
  useEffect(() => { load(); }, [load]);
  function login() { sessionStorage.setItem('manu-resto-auth', 'true'); setAuth(true); }
  function logout() { sessionStorage.removeItem('manu-resto-auth'); setAuth(false); }
  const navigate = (next) => { setPage(next); setDrawer(false); };
  if (!auth) return <Login onLogin={login} />;
  return <div className="app-shell"><aside className={`sidebar ${drawer ? 'open' : ''}`}><div className="side-brand"><Brand /><button className="close-nav icon-button" onClick={() => setDrawer(false)} aria-label="Close navigation"><X size={20} /></button></div><div className="workspace-badge"><span>M</span><div><b>Manu's Restaurant</b><small>Connected workspace</small></div></div><div className="nav-label">WORKSPACE</div><nav>{PAGES.map(({ id, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-link ${page === id ? 'active' : ''}`}><Icon size={18} />{id}{id === 'Stock' && data.products.some((product) => product.tracked && product.low_stock_threshold > 0 && product.stock <= product.low_stock_threshold) && <i className="nav-dot" />}</button>)}</nav><div className="side-bottom"><button className="nav-link" onClick={load}><RefreshCw size={18} />Refresh data</button><button className="nav-link" onClick={logout}><LogOut size={18} />Sign out</button><div className="profile"><i>MM</i><span><b>Manu Manager</b><small>Administrator</small></span></div></div></aside>{drawer && <button className="scrim" onClick={() => setDrawer(false)} aria-label="Close navigation" />}<div className="main-column"><header className="topbar"><div className="crumb"><button className="menu-button icon-button" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><b>{page}</b></div><div className="top-actions"><span className={error ? 'connection offline' : 'connection'}><i />{error ? 'API unavailable' : 'Live API'}</span><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={17} /></button></div></header><main className="content">{error && <div className="error-banner"><AlertCircle size={18} /><span>{error} Check the API URL/CORS configuration, then retry.</span><button onClick={load}>Retry</button></div>}{loading && !data.report ? <div className="loading-card">Connecting to Manu's Resto API…</div> : null}{page === 'Home' && <HomePage data={data} navigate={navigate} loading={loading} />}{page === 'Sales' && <SalesPage data={data} reload={load} />}{page === 'Customers' && <CustomersPage data={data} reload={load} />}{page === 'Stock' && <StockPage data={data} reload={load} />}{page === 'Reports' && <Reports data={data} reload={load} />}{page === 'Settings' && <SettingsPage data={data} reload={load} />}</main><footer className="footer"><span>© 2026 Manu's Resto <i>✳</i> Connected to restaurant API</span><span>Help · Privacy</span></footer></div><nav className="bottom-nav" aria-label="Main navigation">{PAGES.filter((item) => item.id !== 'Settings').map(({ id, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={page === id ? 'selected' : ''}><Icon size={20} /><span>{id}</span></button>)}</nav></div>;
}
export default App;
