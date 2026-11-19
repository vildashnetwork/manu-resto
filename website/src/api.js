const API_URL = (import.meta.env.VITE_API_URL || 'https://manu-ltx7.onrender.com/api').replace(/\/+$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch {
      if (!response.ok && [502, 503, 504].includes(response.status)) throw new Error(`Backend unavailable (HTTP ${response.status}).`);
      throw new Error(`The API returned an invalid response (${response.status}).`);
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Request failed (${response.status}).`);
    error.code = payload?.code;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}
const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
function rows(payload, key) {
  const value = Array.isArray(payload) ? payload : payload?.[key] ?? payload?.data;
  if (!Array.isArray(value)) throw new Error(`Unexpected API response: expected ${key} list.`);
  return value;
}
function entity(payload, key) {
  const value = payload?.[key] ?? payload?.data ?? payload;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Unexpected API response: expected ${key} data.`);
  return value;
}
const normalizeProduct = (p) => ({ ...p, id: String(p.id ?? p._id), low_stock_threshold: p.low_stock_threshold ?? p.lowStockThreshold ?? p.threshold ?? 0, image_url: p.image_url ?? p.imageUrl ?? p.image ?? '', barcode: p.barcode ?? '', tracked: Boolean(p.tracked) });
const normalizeCustomer = (c) => ({ ...c, id: String(c.id ?? c._id), credit_limit: c.credit_limit ?? c.creditLimit ?? 0, balance: c.balance ?? c.outstandingBalance ?? 0 });
const normalizeSale = (s) => ({ ...s, id: String(s.id ?? s._id), receipt_no: s.receipt_no ?? s.receiptNo, paid_amount: s.paid_amount ?? s.paidAmount, credit_amount: s.credit_amount ?? s.creditAmount, created_at: s.created_at ?? s.createdAt, items: Array.isArray(s.items) ? s.items : [] });
export const money = (value) => `${new Intl.NumberFormat('en-US').format(Math.round(Number(value) || 0))} FCFA`;
export const startOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
export const endOfDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
export const getProducts = async () => rows(await get('/products'), 'products').map(normalizeProduct);
export const getCustomers = async () => rows(await get('/customers'), 'customers').map(normalizeCustomer);
export async function getRecentSales(limit = 30, from = 0, to = Date.now(), offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), from: String(from), to: String(to), offset: String(offset) });
  return rows(await get(`/sales?${params}`), 'sales').map(normalizeSale);
}
export async function getReport(from, to) {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  return entity(await get(`/reports?${params}`), 'report');
}
export async function createSale({ idempotencyKey, items, customerId, customerName, payments, allowOverLimit = false }) {
  if (!items?.length) throw new Error('The cart is empty');
  const payload = await post('/sales', { idempotencyKey, items, customerId: customerId || null, customerName: customerName || null, payments, allowOverLimit });
  return { sale: normalizeSale(entity(payload, 'sale')), duplicate: Boolean(payload?.duplicate) };
}
export async function createCustomer(customer) {
  if (!customer.name?.trim()) throw new Error('Customer name is required');
  return entity(await post('/customers', { name: customer.name.trim(), phone: customer.phone || null, code: customer.code || null, creditLimit: customer.creditLimit || 0, openingDebt: customer.openingDebt || 0, notes: customer.notes || null }), 'customer');
}
export async function recordRepayment({ customerId, amount, method = 'Cash', reference = '' }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/payments/repayments', { idempotencyKey: `web-${crypto.randomUUID()}`, customerId, amount, method, reference: reference || null });
}
export async function addStockMovement({ productId, type = 'purchase', qty, note = '' }) {
  if (!qty) throw new Error('Enter a quantity');
  return post('/stock/movements', { productId, type, qty, note: note || null });
}
export async function addExpense({ category, amount, method = 'Cash', note = '', createdAt = Date.now() }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/expenses', { category, amount, method, note: note || null, createdAt });
}
export const getSettings = async () => entity(await get('/settings'), 'settings');
export const updateSettings = async (value) => entity(await put('/settings', value), 'settings');
export const sendTestEmail = async () => entity(await post('/settings/test-email', {}), 'test email');
