import { BACKEND_URL } from '../config/backend';
import { METHODS } from '../theme';

async function request(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
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
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok && [502, 503, 504].includes(response.status)) {
        throw new Error(`The backend service is unavailable (HTTP ${response.status}). Please try again after the API has been redeployed.`);
      }
      throw new Error(`The API returned an invalid response (${response.status}).`);
    }
  }

  if (!response.ok) {
    const fallback = [502, 503, 504].includes(response.status)
      ? `The backend service is unavailable (HTTP ${response.status}). Please try again after the API has been redeployed.`
      : `Request failed (${response.status}).`;
    const error = new Error(payload?.message || payload?.error || fallback);
    error.code = payload?.code;
    error.details = payload?.details;
    throw error;
  }

  return payload;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });

function collection(payload, key) {
  const rows = Array.isArray(payload) ? payload : payload?.[key] ?? payload?.data;
  if (!Array.isArray(rows)) throw new Error(`Unexpected API response: expected a ${key} list.`);
  return rows;
}

function entity(payload, key) {
  const value = payload?.[key] ?? payload?.data ?? payload;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unexpected API response: expected ${key} data.`);
  }
  return value;
}

function normalizeProduct(product) {
  return {
    ...product,
    id: String(product.id ?? product._id),
    low_stock_threshold: product.low_stock_threshold ?? product.lowStockThreshold ?? product.threshold ?? 0,
    image_url: product.image_url ?? product.imageUrl ?? product.image ?? '',
    barcode: product.barcode ?? '',
    tracked: Boolean(product.tracked),
  };
}

function normalizeCustomer(customer) {
  return {
    ...customer,
    id: String(customer.id ?? customer._id),
    credit_limit: customer.credit_limit ?? customer.creditLimit ?? 0,
    balance: customer.balance ?? customer.outstandingBalance ?? 0,
  };
}

function normalizeSale(sale) {
  return {
    ...sale,
    id: String(sale.id ?? sale._id),
    receipt_no: sale.receipt_no ?? sale.receiptNo,
    paid_amount: sale.paid_amount ?? sale.paidAmount,
    credit_amount: sale.credit_amount ?? sale.creditAmount,
    created_at: sale.created_at ?? sale.createdAt,
    items: Array.isArray(sale.items) ? sale.items : [],
  };
}

export async function getProducts() {
  return collection(await get('/products'), 'products').map(normalizeProduct);
}

export async function createProduct(product) {
  if (!product.name?.trim()) throw new Error('Product name is required');
  if (!(product.price > 0)) throw new Error('Selling price must be greater than 0');
  if (!product.imageUrl) throw new Error('Add a product image before saving.');
  const result = entity(await post('/products', {
    name: product.name.trim(),
    category: product.category || 'Other',
    unit: product.unit || 'unit',
    price: product.price,
    cost: product.cost || 0,
    lowStockThreshold: product.threshold || 0,
    tracked: Boolean(product.tracked),
    openingStock: product.openingStock || 0,
    imageUrl: product.imageUrl,
    barcode: product.barcode?.trim() || null,
  }), 'product');
  return normalizeProduct(result).id;
}

export async function updateProduct(productId, product) {
  const result = entity(await put(`/products/${encodeURIComponent(productId)}`, {
    name: product.name.trim(),
    category: product.category,
    unit: product.unit,
    price: product.price,
    cost: product.cost || 0,
    lowStockThreshold: product.threshold || 0,
    barcode: product.barcode?.trim() || null,
    imageUrl: product.imageUrl,
  }), 'product');
  return normalizeProduct(result);
}

export async function addStockMovement({ productId, type, qty, note }) {
  if (!qty) throw new Error('Enter a quantity');
  return post('/stock/movements', { productId, type, qty, note: note || null });
}

export async function getCustomers() {
  return collection(await get('/customers'), 'customers').map(normalizeCustomer);
}

export async function getSettings() {
  return entity(await get('/settings'), 'settings');
}

export async function registerExpoPushToken(token) {
  if (typeof token !== 'string' || !token) throw new Error('A push token is required');
  return post('/settings/push-token', { token });
}

export async function unregisterExpoPushToken(token) {
  if (typeof token !== 'string' || !token) throw new Error('A push token is required');
  return entity(await request('/settings/push-token', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  }), 'push token');
}

export async function updateSettings(settings) {
  return entity(await put('/settings', settings), 'settings');
}

export async function sendTestEmail() {
  return entity(await post('/settings/test-email', {}), 'test email');
}

export async function getCustomer(id) {
  return normalizeCustomer(entity(await get(`/customers/${encodeURIComponent(id)}`), 'customer'));
}

export async function createCustomer(customer) {
  if (!customer.name?.trim()) throw new Error('Customer name is required');
  const result = entity(await post('/customers', {
    name: customer.name.trim(),
    phone: customer.phone || null,
    code: customer.code || null,
    creditLimit: customer.creditLimit || 0,
    openingDebt: customer.openingDebt || 0,
    notes: customer.notes || null,
  }), 'customer');
  return String(result.id ?? result._id);
}

export async function updateCustomer({ id, name, phone, code, creditLimit, openingDebt, notes }) {
  if (!id) throw new Error('Customer ID is required');
  const payload = {};
  if (typeof name === 'string') payload.name = name.trim() || null;
  if (typeof phone === 'string') payload.phone = phone.trim() || null;
  if (typeof code === 'string') payload.code = code.trim() || null;
  if (typeof creditLimit !== 'undefined') payload.creditLimit = creditLimit || 0;
  if (typeof openingDebt !== 'undefined') payload.openingDebt = openingDebt || 0;
  if (typeof notes === 'string') payload.notes = notes.trim() || null;
  return entity(await put(`/customers/${encodeURIComponent(id)}`, payload), 'customer');
}

export async function deleteCustomer(id) {
  if (!id) throw new Error('Customer ID is required');
  return entity(await request(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'customer');
}

export async function deleteProduct(id) {
  if (!id) throw new Error('Product ID is required');
  return entity(await request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'product');
}

export async function getStatement(customerId) {
  return collection(
    await get(`/customers/${encodeURIComponent(customerId)}/statement`),
    'statement'
  );
}

export async function recordRepayment({ idempotencyKey, customerId, amount, method, reference, createdAt }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/payments/repayments', {
    idempotencyKey,
    customerId,
    amount,
    method,
    reference: reference || null,
    ...(typeof createdAt === 'number' ? { createdAt } : {}),
  });
}

export async function createSale({ idempotencyKey, items, customerId, customerName, payments, allowOverLimit = false, createdAt }) {
  if (!items?.length) throw new Error('The cart is empty');
  const payload = await post('/sales', {
    idempotencyKey,
    items,
    customerId: customerId || null,
    customerName: customerName || null,
    payments,
    allowOverLimit,
    ...(typeof createdAt === 'number' ? { createdAt } : {}),
  });
  const result = entity(payload, 'sale');
  return { sale: normalizeSale(result), duplicate: Boolean(payload?.duplicate ?? result.duplicate) };
}

export async function updateSalePayment(saleId, { paidAmount, method, idempotencyKey }) {
  const result = entity(await put(`/sales/${encodeURIComponent(saleId)}/payment`, {
    paidAmount,
    method,
    idempotencyKey,
  }), 'sale');
  return normalizeSale(result);
}

export async function updateSaleDate(saleId, createdAt) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('Pick a valid sale date');
  const result = entity(await put(`/sales/${encodeURIComponent(saleId)}/date`, { createdAt }), 'sale');
  return normalizeSale(result);
}

export async function cancelSale(saleId, reason) {
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  return post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
}

export async function getRecentSales(limit = 30, from = 0, to = Date.now(), offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), from: String(from), to: String(to), offset: String(offset) });
  return collection(await get(`/sales?${params.toString()}`), 'sales').map(normalizeSale);
}

export async function getAllSales(from, to) {
  const pageSize = 100;
  const sales = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await getRecentSales(pageSize, from, to, offset);
    sales.push(...page);
    if (page.length < pageSize) return sales;
  }
}

export async function addExpense({ category, amount, method, note, createdAt }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/expenses', { category, amount, method, note: note || null, createdAt });
}

export async function updateExpense(expenseId, { category, amount, method, note, createdAt }) {
  if (!expenseId) throw new Error('Expense ID is required');
  if (!category?.trim()) throw new Error('Expense category is required');
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Enter a positive whole-number amount');
  if (!METHODS.includes(method)) throw new Error('Select a valid payment method');
  return entity(await put(`/expenses/${encodeURIComponent(expenseId)}`, {
    category: category.trim(),
    amount,
    method,
    note: note || null,
    createdAt,
  }), 'expense');
}

export async function deleteExpense(expenseId) {
  if (!expenseId) throw new Error('Expense ID is required');
  return request(`/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' });
}

export async function getReport(from, to) {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  return entity(await get(`/reports?${params.toString()}`), 'report');
}
