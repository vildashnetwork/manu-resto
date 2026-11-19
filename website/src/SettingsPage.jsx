import React, { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { updateSettings, sendTestEmail } from './api.js';
import { PageTitle, Button } from './ui.jsx';

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

export default function SettingsPage({ data, reload }) {
  const [email, setEmail] = useState(data.settings?.adminEmail || ''); const [notifications, setNotifications] = useState({ ...DEFAULT_NOTIFICATIONS, ...(data.settings?.notifications || {}) }); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data.settings) { setEmail(data.settings.adminEmail || ''); setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.settings.notifications }); } }, [data.settings]);
  async function save() { setBusy(true); try { await updateSettings({ adminEmail: email.trim(), notifications }); await reload(); alert('Notification settings saved.'); } catch (error) { alert(error.message); } finally { setBusy(false); } }
  async function test() { setBusy(true); try { const result = await sendTestEmail(); alert(`Test email sent to ${result.recipient}.`); } catch (error) { alert(error.message); } finally { setBusy(false); } }
  return <><PageTitle eyebrow="WORKSPACE PREFERENCES" title="Settings"><Button secondary onClick={test} disabled={busy}><Bell size={16} /> Send test email</Button><Button onClick={save} disabled={busy}><Check size={16} /> Save settings</Button></PageTitle><section className="panel settings-panel"><h2>Admin email</h2><p>This address receives the email notifications enabled below.</p><label className="settings-email">Notification email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label><div className="notification-list">{NOTIFICATIONS.map(([key, title, detail]) => <label className="notification-option" key={key}><span><b>{title}</b><small>{detail}</small></span><input type="checkbox" checked={Boolean(notifications[key])} onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div><small className="settings-note">Email sender and push delivery are configured by the backend.</small></section></>;
                                                                                                                          }
