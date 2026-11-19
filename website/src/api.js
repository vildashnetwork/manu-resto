// website/src/api.js
// Set VITE_API_URL (and optionally VITE_API_KEY) in Vercel project settings.
const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const API_KEY = import.meta.env.VITE_API_KEY || '';

/* ---------- low-level helpers ---------- */

/** Turn any error payload shape into a readable string. */
function messageFrom(payload) {
  const m = payload?.message ?? payload?.error ?? payload;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object') {
    if (typeof m.message === 'string') return m.message;
    try { return JSON.stringify(m).slice(0, 200); } catch { return ''; }
  }
  return '';
}

async function request(method, path, { body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString()
    : '';
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${qs}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the API (${method} ${BASE_URL}${path}). Check VITE_API_URL and the server's CORS_ORIGIN.`);
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text.slice(0, 200) }; }
  }
  if (!response.ok) {
    const error = new Error(`${messageFrom(payload) || 'Request failed'} (${method} ${path} → ${response.status})`);
    error.status = response.status;
    error.code = payload?.code;       // e.g. 'CREDIT_LIMIT'
    error.details = payload?.details; // e.g. { balance, limit, credit }
    throw error;
  }
  // A 200 that is not JSON usually means VITE_API_URL points at the website instead of the API.
  if (text && payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 1 && typeof payload.message === 'string' && /^\s*</.test(payload.message)) {
    throw new Error(`The API URL returned a web page, not JSON (${method} ${BASE_URL}${path}). Set VITE_API_URL to your backend, e.g. https://your-api.example.com/api`);
  }
  return payload;
}

const get = (path, query) => request('GET', path, { query });
const post = (path, body = {}) => request('POST', path, { body });
const put = (path, body = {}) => request('PUT', path, { body });
const del = (path) => request('DELETE', path);

/** Pull a single object out of common response shapes. */
function entity(payload, key) {
  if (!payload) return payload;
  return payload[key] ?? payload.data?.[key] ?? payload.data ?? payload;
}

/** Pull an array out of common response shapes. */
function list(payload, key) {
  if (Array.isArray(payload)) return payload;
  const value = payload?.[key] ?? payload?.data?.[key] ?? payload?.data ?? payload?.items;
  return Array.isArray(value) ? value : [];
}

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/* ---------- formatting and date helpers ---------- */

export function money(value) {
  return `${Math.round(num(value)).toLocaleString('fr-FR')} FCFA`;
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/* ---------- normalizers (UI expects snake_case) ---------- */

function normalizeSale(raw = {}) {
  const total = num(raw.total ?? raw.totalAmount);
  const paid = num(raw.paid_amount ?? raw.paidAmount ?? raw.amountPaid);
  return {
    ...raw,
    id: raw.id ?? raw._id,
    receipt_no: raw.receipt_no ?? raw.receiptNo ?? raw.receiptNumber ?? '',
    customer_name: raw.customer_name ?? raw.customerName ?? raw.customer?.name ?? '',
    created_at: raw.created_at ?? raw.createdAt ?? raw.date,
    total,
    paid_amount: paid,
    credit_amount: num(raw.credit_amount ?? raw.creditAmount, Math.max(0, total - paid)),
    payment_method: raw.payment_method ?? raw.paymentMethod ?? raw.payments?.[0]?.method,
    cancel_reason: raw.cancel_reason ?? raw.cancelReason ?? '',
    status: String(raw.status || 'completed').toLowerCase().replace('canceled', 'cancelled'),
  };
}

function normalizeProduct(raw = {}) {
  return {
    ...raw,
    id: raw.id ?? raw._id,
    name: raw.name ?? '',
    price: num(raw.price),
    cost: num(raw.cost),
    stock: num(raw.stock ?? raw.quantity),
    tracked: Boolean(raw.tracked ?? raw.trackStock ?? raw.track_stock),
    low_stock_threshold: num(raw.low_stock_threshold ?? raw.lowStockThreshold),
    category: raw.category ?? '',
    unit: raw.unit ?? '',
    barcode: raw.barcode ?? '',
    image_url: raw.image_url ?? raw.imageUrl ?? '',
  };
}

function normalizeCustomer(raw = {}) {
  return {
    ...raw,
    id: raw.id ?? raw._id,
    name: raw.name ?? '',
    phone: raw.phone ?? '',
    code: raw.code ?? '',
    credit_limit: num(raw.credit_limit ?? raw.creditLimit),
    balance: num(raw.balance ?? raw.debt ?? raw.owed),
  };
}

function normalizeExpense(raw = {}) {
  return {
    ...raw,
    id: raw.id ?? raw._id,
    category: raw.category ?? 'Other',
    amount: num(raw.amount),
    method: raw.method ?? 'Cash',
    note: raw.note ?? '',
    created_at: raw.created_at ?? raw.createdAt ?? raw.date,
  };
}

function normalizeReport(raw = {}) {
  return {
    ...raw,
    salesCount: num(raw.salesCount),
    totalSales: num(raw.totalSales),
    cashFromSales: num(raw.cashFromSales),
    creditSales: num(raw.creditSales),
    debtRecovered: num(raw.debtRecovered),
    outstandingDebt: num(raw.outstandingDebt),
    debtorCount: num(raw.debtorCount),
    expenses: num(raw.expenses),
    netCashMovement: num(raw.netCashMovement),
    grossProfitEstimate: num(raw.grossProfitEstimate),
    expectedCash: num(raw.expectedCash),
    byMethod: (raw.byMethod || []).map((m) => ({
      method: m.method, sales: num(m.sales), repayments: num(m.repayments),
    })),
    topProducts: (raw.topProducts || []).map((p) => ({
      name: p.name, qty: num(p.qty), revenue: num(p.revenue),
    })),
    expList: (raw.expList || []).map(normalizeExpense),
  };
}

/* ---------- reads ---------- */

export async function getProducts() {
  return list(await get('/products'), 'products').map(normalizeProduct);
}

export async function getCustomers() {
  return list(await get('/customers'), 'customers').map(normalizeCustomer);
}

export async function getRecentSales(limit = 50, from, to) {
  const payload = await get('/sales', { limit, from, to });
  return list(payload, 'sales').map(normalizeSale);
}

/** Every sale in the period (used for the printed report). */
export async function getAllSales(from, to) {
  return getRecentSales(5000, from, to);
}

export async function getReport(from, to) {
  return normalizeReport(entity(await get('/reports/summary', { from, to }), 'report'));
}

export async function getSettings() {
  return entity(await get('/settings'), 'settings') || {};
}

export async function updateSettings(settings) {
  return entity(await put('/settings', settings), 'settings');
}

export async function sendTestEmail(payload = {}) {
  return post('/settings/test-email', payload);
}

/* ---------- writes ---------- */

export async function createSale({
  idempotencyKey, items, customerId = null, payments = [], createdAt, allowOverLimit = false,
}) {
  if (!idempotencyKey) throw new Error('Idempotency key is required');
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one item');
  const body = { idempotencyKey, items, customerId, payments, allowOverLimit };
  if (createdAt) body.createdAt = createdAt;
  return normalizeSale(entity(await post('/sales', body), 'sale'));
}

export async function createCustomer({ name, phone = '' }) {
  if (!name?.trim()) throw new Error('Customer name is required');
  return normalizeCustomer(
    entity(await post('/customers', { name: name.trim(), phone: phone.trim() }), 'customer')
  );
}

export async function recordRepayment({ customerId, amount, method = 'Cash' }) {
  if (!customerId) throw new Error('Customer is required');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Repayment must be a positive whole number');
  return post(`/customers/${encodeURIComponent(customerId)}/repayments`, { amount, method });
}

export async function addStockMovement({ productId, type = 'purchase', qty, note = '' }) {
  if (!productId) throw new Error('Product is required');
  if (!(num(qty) > 0)) throw new Error('Quantity must be greater than zero');
  return post('/stock-movements', { productId, type, qty, note });
}

export async function addExpense({ category = 'Other', amount, method = 'Cash', note = '', createdAt }) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Expense must be a positive whole number');
  const body = { category, amount, method, note };
  if (createdAt) body.createdAt = createdAt;
  return post('/expenses', body);
}

export async function updateExpense(id, { category, amount, method, note = '', createdAt }) {
  if (!id) throw new Error('Expense ID is required');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Expense must be a positive whole number');
  return put(`/expenses/${encodeURIComponent(id)}`, { category, amount, method, note, createdAt });
}

export async function deleteExpense(id) {
  if (!id) throw new Error('Expense ID is required');
  return del(`/expenses/${encodeURIComponent(id)}`);
}

export async function cancelSale(saleId, reason) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  return post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
}

export async function updateSalePayment(saleId, { paidAmount, method, idempotencyKey }) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0) throw new Error('Paid amount must be a non-negative whole number');
  if (!idempotencyKey) throw new Error('Idempotency key is required');
  const payload = await put(`/sales/${encodeURIComponent(saleId)}/payment`, { paidAmount, method, idempotencyKey });
  return normalizeSale(entity(payload, 'sale'));
}

export async function updateSaleDate(saleId, createdAt) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!createdAt) throw new Error('A date is required');
  const payload = await put(`/sales/${encodeURIComponent(saleId)}/date`, { createdAt });
  return normalizeSale(entity(payload, 'sale'));
}
