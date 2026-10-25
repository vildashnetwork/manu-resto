import { BACKEND_URL } from '../config/backend';
import * as Local from '../db/repo';
import { getAppMode, hasOfflineSnapshot } from '../db';
import { cacheSnapshot } from '../db/cache';

const REQUEST_TIMEOUT_MS = 8000;
const backgroundRefreshes = new Map();

async function offlineMode() {
  return (await getAppMode()) === 'offline';
}

function refreshInBackground(key, refresh) {
  if (backgroundRefreshes.has(key)) return;
  const task = Promise.resolve()
    .then(refresh)
    .catch((error) => console.warn(`Background refresh failed for ${key}:`, error))
    .finally(() => backgroundRefreshes.delete(key));
  backgroundRefreshes.set(key, task);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = (options.method || 'GET') === 'GET' ? REQUEST_TIMEOUT_MS : 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
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
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The backend did not respond within ${Math.round(timeoutMs / 1000)} seconds. Check your connection and sync again.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

async function getProductsOnline() {
  return collection(await get('/products'), 'products').map(normalizeProduct);
}

async function createProductOnline(product) {
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

async function updateProductOnline(productId, product) {
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

async function addStockMovementOnline({ productId, type, qty, note }) {
  if (!qty) throw new Error('Enter a quantity');
  return post('/stock/movements', { productId, type, qty, note: note || null });
}

async function getCustomersOnline() {
  return collection(await get('/customers'), 'customers').map(normalizeCustomer);
}

async function getSettingsOnline() {
  return entity(await get('/settings'), 'settings');
}

async function updateSettingsOnline(settings) {
  return entity(await put('/settings', settings), 'settings');
}

async function getCustomerOnline(id) {
  return normalizeCustomer(entity(await get(`/customers/${encodeURIComponent(id)}`), 'customer'));
}

async function createCustomerOnline(customer) {
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

async function getStatementOnline(customerId) {
  return collection(
    await get(`/customers/${encodeURIComponent(customerId)}/statement`),
    'statement'
  );
}

async function recordRepaymentOnline({ idempotencyKey, customerId, amount, method, reference }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/payments/repayments', {
    idempotencyKey,
    customerId,
    amount,
    method,
    reference: reference || null,
  });
}

async function createSaleOnline({ idempotencyKey, items, customerId, customerName, payments, allowOverLimit = false }) {
  if (!items?.length) throw new Error('The cart is empty');
  const payload = await post('/sales', {
    idempotencyKey,
    items,
    customerId: customerId || null,
    customerName: customerName || null,
    payments,
    allowOverLimit,
  });
  const result = entity(payload, 'sale');
  return { sale: normalizeSale(result), duplicate: Boolean(payload?.duplicate ?? result.duplicate) };
}

async function updateSalePaymentOnline(saleId, { paidAmount, method, idempotencyKey }) {
  const result = entity(await put(`/sales/${encodeURIComponent(saleId)}/payment`, {
    paidAmount,
    method,
    idempotencyKey,
  }), 'sale');
  return normalizeSale(result);
}

async function cancelSaleOnline(saleId, reason) {
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  return post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
}

async function getRecentSalesOnline(limit = 30, from = 0, to = Date.now()) {
  const params = new URLSearchParams({ limit: String(limit), from: String(from), to: String(to) });
  return collection(await get(`/sales?${params.toString()}`), 'sales').map(normalizeSale);
}

async function addExpenseOnline({ category, amount, method, note }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/expenses', { category, amount, method, note: note || null });
}

async function getReportOnline(from, to) {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  return entity(await get(`/reports?${params.toString()}`), 'report');
}

export async function getProducts() {
  if (await offlineMode()) return (await Local.getProducts()).map(normalizeProduct);
  const [cached, snapshotReady] = await Promise.all([Local.getProducts(), hasOfflineSnapshot()]);
  if (cached.length || snapshotReady) {
    refreshInBackground('products', async () => {
      const products = await getProductsOnline();
      await cacheSnapshot({ products });
    });
    return cached.map(normalizeProduct);
  }
  const products = await getProductsOnline();
  refreshInBackground('products', () => cacheSnapshot({ products }));
  return products;
}

export async function createProduct(product) {
  if (await offlineMode()) return Local.createProduct(product);
  return createProductOnline(product);
}

export async function updateProduct(productId, product) {
  if (await offlineMode()) return Local.updateProduct(productId, product);
  return updateProductOnline(productId, product);
}

export async function addStockMovement(movement) {
  if (await offlineMode()) return Local.addStockMovement(movement);
  return addStockMovementOnline(movement);
}

export async function getCustomers() {
  if (await offlineMode()) return (await Local.getCustomers()).map(normalizeCustomer);
  const [cached, snapshotReady] = await Promise.all([Local.getCustomers(), hasOfflineSnapshot()]);
  if (cached.length || snapshotReady) {
    refreshInBackground('customers', async () => {
      const customers = await getCustomersOnline();
      await cacheSnapshot({ customers });
    });
    return cached.map(normalizeCustomer);
  }
  const customers = await getCustomersOnline();
  refreshInBackground('customers', () => cacheSnapshot({ customers }));
  return customers;
}

export async function getSettings() {
  if (await offlineMode()) return Local.getCachedSettings();
  const cached = await Local.getCachedSettings();
  refreshInBackground('settings', async () => {
    const settings = await getSettingsOnline();
    await Local.cacheEmailSettings(settings);
  });
  return cached;
}

export async function updateSettings(settings) {
  if (await offlineMode()) return Local.saveCachedSettings(settings);
  const saved = await updateSettingsOnline(settings);
  await Local.cacheEmailSettings(saved);
  return saved;
}

export async function getCustomer(id) {
  if (await offlineMode()) {
    const customer = await Local.getCustomer(id);
    if (!customer) throw new Error('Customer not found');
    return normalizeCustomer(customer);
  }
  const [cached, snapshotReady] = await Promise.all([Local.getCustomer(id), hasOfflineSnapshot()]);
  if (cached || snapshotReady) {
    refreshInBackground(`customer:${id}`, async () => {
      const customer = await getCustomerOnline(id);
      await cacheSnapshot({ customers: [customer] });
    });
    if (cached) return normalizeCustomer(cached);
  }
  return getCustomerOnline(id);
}

export async function createCustomer(customer) {
  if (await offlineMode()) return Local.createCustomer(customer);
  return createCustomerOnline(customer);
}

export async function getStatement(customerId) {
  if (await offlineMode()) return Local.getStatement(customerId);
  return getStatementOnline(customerId);
}

export async function recordRepayment(payment) {
  if (await offlineMode()) return Local.recordRepayment(payment);
  return recordRepaymentOnline(payment);
}

export async function createSale(sale) {
  if (await offlineMode()) return Local.createSale(sale);
  return createSaleOnline(sale);
}

export async function updateSalePayment(saleId, payment) {
  if (await offlineMode()) return Local.updateSalePayment(saleId, payment);
  return updateSalePaymentOnline(saleId, payment);
}

export async function cancelSale(saleId, reason) {
  if (await offlineMode()) return Local.cancelSale(saleId, reason);
  return cancelSaleOnline(saleId, reason);
}

export async function getRecentSales(limit = 30, from = 0, to = Date.now()) {
  if (await offlineMode()) return Local.getRecentSales(limit, from, to);
  const [cached, snapshotReady] = await Promise.all([
    Local.getRecentSales(limit, from, to),
    hasOfflineSnapshot(),
  ]);
  if (cached.length || snapshotReady) {
    refreshInBackground('sales', async () => {
      const sales = await getRecentSalesOnline(limit, from, to);
      await cacheSnapshot({ sales });
    });
    return cached.map(normalizeSale);
  }
  const sales = await getRecentSalesOnline(limit, from, to);
  refreshInBackground('sales', () => cacheSnapshot({ sales }));
  return sales;
}

export async function addExpense(expense) {
  if (await offlineMode()) return Local.addExpense(expense);
  return addExpenseOnline(expense);
}

export async function getReport(from, to) {
  if (await offlineMode()) return Local.getReport(from, to);
  if (await hasOfflineSnapshot()) {
    refreshInBackground('report', () => getReportOnline(from, to));
    return Local.getReport(from, to);
  }
  return getReportOnline(from, to);
}
