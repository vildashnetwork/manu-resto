import { BACKEND_URL } from '../config/backend';
import { uid } from '../utils';
import {
  commitLocalChanges, getMeta, getRecord, listRecords, putRecord, resolveId, setMeta,
} from '../db';

export async function backendRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The backend request timed out. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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

const get = (path) => backendRequest(path);
const post = (path, body) => backendRequest(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => backendRequest(path, { method: 'PUT', body: JSON.stringify(body) });

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

export async function createProductOnline(product, idempotencyKey) {
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
    idempotencyKey,
  }), 'product');
  return normalizeProduct(result).id;
}

export async function updateProductOnline(productId, product) {
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

export async function addStockMovementOnline({ productId, type, qty, note, idempotencyKey }) {
  if (!qty) throw new Error('Enter a quantity');
  return post('/stock/movements', { productId, type, qty, note: note || null, idempotencyKey });
}

async function getCustomersOnline() {
  return collection(await get('/customers'), 'customers').map(normalizeCustomer);
}

async function getSettingsOnline() {
  return entity(await get('/settings'), 'settings');
}

export async function updateSettingsOnline(settings) {
  return entity(await put('/settings', settings), 'settings');
}

async function getCustomerOnline(id) {
  return normalizeCustomer(entity(await get(`/customers/${encodeURIComponent(id)}`), 'customer'));
}

export async function createCustomerOnline(customer, idempotencyKey) {
  if (!customer.name?.trim()) throw new Error('Customer name is required');
  const result = entity(await post('/customers', {
    name: customer.name.trim(),
    phone: customer.phone || null,
    code: customer.code || null,
    creditLimit: customer.creditLimit || 0,
    openingDebt: customer.openingDebt || 0,
    notes: customer.notes || null,
    idempotencyKey,
  }), 'customer');
  return String(result.id ?? result._id);
}

async function getStatementOnline(customerId) {
  return collection(
    await get(`/customers/${encodeURIComponent(customerId)}/statement`),
    'statement'
  );
}

export async function recordRepaymentOnline({ idempotencyKey, customerId, amount, method, reference }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/payments/repayments', {
    idempotencyKey,
    customerId,
    amount,
    method,
    reference: reference || null,
  });
}

export async function createSaleOnline({ idempotencyKey, items, customerId, customerName, payments, allowOverLimit = false }) {
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

export async function updateSalePaymentOnline(saleId, { paidAmount, method, idempotencyKey }) {
  const result = entity(await put(`/sales/${encodeURIComponent(saleId)}/payment`, {
    paidAmount,
    method,
    idempotencyKey,
  }), 'sale');
  return normalizeSale(result);
}

export async function cancelSaleOnline(saleId, reason) {
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  return post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
}

async function getRecentSalesOnline(limit = 30, from = 0, to = Date.now()) {
  const params = new URLSearchParams({ limit: String(limit), from: String(from), to: String(to) });
  return collection(await get(`/sales?${params.toString()}`), 'sales').map(normalizeSale);
}

export async function addExpenseOnline({ category, amount, method, note, idempotencyKey }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  return post('/expenses', { category, amount, method, note: note || null, idempotencyKey });
}

async function getReportOnline(from, to) {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  return entity(await get(`/reports?${params.toString()}`), 'report');
}

function triggerSync() {
  getMeta('connectionMode', 'online').then((mode) => {
    if (mode !== 'online') return;
    import('../db/sync').then(({ syncNow }) => syncNow()).catch((error) => {
      console.warn('Background sync failed', error);
    });
  }).catch((error) => console.warn('Could not read connection mode', error));
}

function imageProduct(product) {
  const normalized = normalizeProduct(product);
  return { ...normalized, image_url: product.localImageUri || normalized.image_url };
}

async function cachedOrFetch(type, fetchOnline) {
  const cached = await listRecords(type);
  if (cached.length > 0 || await getMeta('connectionMode', 'online') === 'offline') return cached;
  const rows = await fetchOnline();
  for (const row of rows) await putRecord(type, row);
  return rows;
}

async function refreshSnapshot() {
  const payload = await get('/sync/snapshot');
  const snapshot = entity(payload, 'snapshot');
  const normalized = {
    products: collection(snapshot, 'products').map(imageProduct),
    customers: collection(snapshot, 'customers').map(normalizeCustomer),
    sales: collection(snapshot, 'sales').map(normalizeSale),
    payments: collection(snapshot, 'payments'),
    ledger: collection(snapshot, 'ledger'),
    expenses: collection(snapshot, 'expenses'),
    movements: collection(snapshot, 'movements'),
    settings: collection(snapshot, 'settings'),
  };
  const { replaceRemoteSnapshot } = await import('../db');
  await replaceRemoteSnapshot(normalized);
  await setMeta('lastSyncAt', payload.generatedAt || Date.now());
  return normalized;
}

export async function getProducts() {
  const rows = await cachedOrFetch('products', getProductsOnline);
  return rows.map(imageProduct).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function createProduct(product) {
  if (!product.name?.trim()) throw new Error('Product name is required');
  if (!(product.price > 0)) throw new Error('Selling price must be greater than 0');
  if (!product.imageUrl) throw new Error('Add a product image before saving.');
  const id = uid();
  const idempotencyKey = uid();
  const record = imageProduct({
    ...product,
    id,
    idempotencyKey,
    _localPending: true,
    low_stock_threshold: product.threshold || 0,
    stock: product.tracked ? product.openingStock || 0 : 0,
    imageUrl: product.imageUrl,
    localImageUri: product.localImageUri || (String(product.imageUrl).startsWith('file:') ? product.imageUrl : ''),
    created_at: Date.now(),
  });
  await commitLocalChanges(
    [{ type: 'products', record }],
    { id: idempotencyKey, type: 'product.create', payload: { idempotencyKey, localId: id, product } }
  );
  triggerSync();
  return id;
}

export async function updateProduct(productId, product) {
  const old = await getRecord('products', productId);
  if (!old) throw new Error('Product is not available on this device. Sync the catalog before editing it.');
  const record = imageProduct({
    ...old,
    ...product,
    id: String(productId),
    low_stock_threshold: product.threshold ?? old.low_stock_threshold,
    imageUrl: product.imageUrl || old.imageUrl,
    localImageUri: product.localImageUri
      || (String(product.imageUrl || '').startsWith('file:') ? product.imageUrl : old.localImageUri || ''),
  });
  await commitLocalChanges(
    [{ type: 'products', record }],
    { id: uid(), type: 'product.update', payload: { localId: String(productId), product } }
  );
  triggerSync();
  return record;
}

export async function addStockMovement(movement) {
  if (!movement.qty) throw new Error('Enter a quantity');
  const productId = String(movement.productId);
  const product = await getRecord('products', productId);
  if (!product) throw new Error('Product is not available on this device.');
  const nextStock = Number(product.stock || 0) + Number(movement.qty);
  if (product.tracked && nextStock < 0) throw new Error('Not enough stock for this movement.');
  const key = uid();
  const movementRecord = {
    id: key, productId, idempotencyKey: key, type: movement.type, qty: movement.qty,
    note: movement.note || null, created_at: Date.now(),
  };
  const changes = [{ type: 'movements', record: movementRecord }];
  if (product.tracked) changes.push({ type: 'products', record: { ...product, stock: nextStock } });
  await commitLocalChanges(changes, {
    id: key, type: 'stock.move', payload: { ...movement, idempotencyKey: key },
  });
  triggerSync();
  return { product: { ...product, stock: nextStock } };
}

export async function getCustomers() {
  const rows = await cachedOrFetch('customers', getCustomersOnline);
  return rows.map(normalizeCustomer).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSettings() {
  const setting = await getRecord('settings', 'main');
  if (setting) return setting;
  if (await getMeta('connectionMode', 'online') === 'offline') {
    return { adminEmail: '', notifications: { lowStock: true, creditDebt: true, expenses: true }, senderEmail: '', senderConfigured: false };
  }
  const result = await getSettingsOnline();
  await putRecord('settings', { ...result, id: 'main' });
  return result;
}

export async function updateSettings(settings) {
  const current = await getRecord('settings', 'main') || {
    adminEmail: '',
    notifications: { lowStock: true, creditDebt: true, expenses: true },
    senderEmail: '',
    senderConfigured: false,
  };
  const saved = { ...current, ...settings, id: 'main' };
  await commitLocalChanges(
    [{ type: 'settings', record: saved }],
    { id: uid(), type: 'settings.update', payload: settings }
  );
  triggerSync();
  return saved;
}

export async function getCustomer(id) {
  const cached = await getRecord('customers', id);
  if (cached) return normalizeCustomer(cached);
  if (await getMeta('connectionMode', 'online') === 'offline') throw new Error('This customer is not available on this device.');
  const customer = await getCustomerOnline(id);
  await putRecord('customers', customer);
  return customer;
}

export async function createCustomer(customer) {
  if (!customer.name?.trim()) throw new Error('Customer name is required');
  const id = uid();
  const idempotencyKey = uid();
  const created = normalizeCustomer({
    ...customer, id, balance: customer.openingDebt || 0, credit_limit: customer.creditLimit || 0,
    idempotencyKey, active: true, created_at: Date.now(), _localPending: true,
  });
  const records = [{ type: 'customers', record: created }];
  if (created.balance > 0) {
    records.push({ type: 'ledger', record: {
      id: uid(), customerId: id, type: 'opening', amount: created.balance,
      idempotencyKey: `${idempotencyKey}:opening-ledger`,
      ref_type: 'migration', note: 'Opening balance (migrated from paper book)', created_at: Date.now(),
    } });
  }
  await commitLocalChanges(records, {
    id: idempotencyKey, type: 'customer.create', payload: { customer, localId: id, idempotencyKey },
  });
  triggerSync();
  return id;
}

export async function getStatement(customerId) {
  let rows = (await listRecords('ledger')).filter((row) => String(row.customerId) === String(customerId));
  if (!rows.length && await getMeta('connectionMode', 'online') !== 'offline') {
    rows = await getStatementOnline(customerId);
    for (const row of rows) await putRecord('ledger', row);
  }
  let balance = 0;
  return rows.sort((a, b) => a.created_at - b.created_at).map((row) => {
    balance += Number(row.amount || 0);
    return { ...row, balance };
  }).reverse();
}

export async function recordRepayment(payment) {
  const { customerId, amount, method, idempotencyKey } = payment;
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  const customer = await getCustomer(customerId);
  if (amount > customer.balance) throw new Error(`Amount exceeds outstanding balance (${customer.balance}).`);
  const stamp = Date.now();
  await commitLocalChanges([
    { type: 'customers', record: { ...customer, balance: customer.balance - amount } },
    { type: 'ledger', record: {
    id: idempotencyKey, customerId: String(customerId), type: 'payment', amount: -amount,
    idempotencyKey: `${idempotencyKey}:ledger`,
    ref_type: 'payment', note: `Repayment (${method})`, created_at: stamp,
    } },
    { type: 'payments', record: {
    id: idempotencyKey, kind: 'repayment', customerId: String(customerId), method, amount,
    idempotencyKey, status: 'ok', created_at: stamp,
    } },
  ], { id: idempotencyKey, type: 'payment.repayment', payload: payment });
  triggerSync();
  return { duplicate: false };
}

export async function createSale(sale) {
  if (!sale.items?.length) throw new Error('The cart is empty');
  const key = sale.idempotencyKey || uid();
  const products = await listRecords('products');
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const items = sale.items.map((item) => {
    const product = productById.get(String(item.productId));
    if (!product) throw new Error('A product in this sale is not available on this device.');
    if (!Number.isSafeInteger(item.qty) || item.qty < 1) throw new Error('Item quantities must be positive whole numbers.');
    if (product.tracked && product.stock < item.qty) throw new Error(`Not enough stock for ${product.name}.`);
    const unitPrice = item.unitPrice ?? product.price;
    return {
      productId: String(product.id), product_name: product.name, unit_price: unitPrice,
      unit_cost: product.cost || 0, qty: item.qty, line_total: unitPrice * item.qty,
    };
  });
  const total = items.reduce((sum, item) => sum + item.line_total, 0);
  const payments = (sale.payments || []).filter((payment) => payment.amount > 0);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (paid > total) throw new Error('Payments exceed the sale total.');
  const credit = total - paid;
  let customer = null;
  if (sale.customerId) customer = await getCustomer(sale.customerId);
  if (credit > 0 && !customer) throw new Error('Select a customer to sell on credit.');
  if (credit > 0 && customer.credit_limit > 0 && customer.balance + credit > customer.credit_limit && !sale.allowOverLimit) {
    const error = new Error('Credit limit exceeded.');
    error.code = 'CREDIT_LIMIT';
    error.details = { balance: customer.balance, limit: customer.credit_limit, credit };
    throw error;
  }
  const id = uid();
  const createdAt = Date.now();
  const saleRecord = normalizeSale({
    id, receipt_no: `LOCAL-${new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(0, 6).toUpperCase()}`,
    customerId: customer?.id || null, customer_name: customer?.name || sale.customerName || null,
    items, total, paid_amount: paid, credit_amount: credit, status: 'completed', created_at: createdAt,
    idempotencyKey: key, _localPending: true,
  });
  const changes = [{ type: 'sales', record: saleRecord }];
  for (const item of items) {
    const product = productById.get(item.productId);
    if (product.tracked) {
      changes.push({ type: 'products', record: { ...product, stock: product.stock - item.qty } });
      changes.push({ type: 'movements', record: {
        id: `${key}-${item.productId}`, productId: item.productId, type: 'sale', qty: -item.qty,
          refId: id, idempotencyKey: `${key}:movement:${item.productId}`, created_at: createdAt,
      } });
    }
  }
  if (credit > 0) {
    changes.push({ type: 'customers', record: { ...customer, balance: customer.balance + credit } });
    changes.push({ type: 'ledger', record: {
      id: `${key}-ledger`, customerId: customer.id, type: 'credit_sale', amount: credit,
      idempotencyKey: `${key}:ledger`,
      ref_type: 'sale', ref_id: id, note: `Credit sale ${saleRecord.receipt_no}`, created_at: createdAt,
    } });
  }
  for (const [index, payment] of payments.entries()) {
    changes.push({ type: 'payments', record: {
      id: `${key}:${index}`, kind: 'sale', saleId: id, customerId: customer?.id || null,
      ...payment, idempotencyKey: `${key}:${index}`, status: 'ok', created_at: createdAt,
    } });
  }
  await commitLocalChanges(changes, {
    id: key, type: 'sale.create', payload: { ...sale, items: sale.items, localId: id, idempotencyKey: key },
  });
  triggerSync();
  return { sale: saleRecord, duplicate: false };
}

export async function updateSalePayment(saleId, payment) {
  const sale = await getRecord('sales', saleId);
  if (!sale) throw new Error('Sale is not available on this device.');
  const paidAmount = payment.paidAmount;
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0 || paidAmount > sale.total) throw new Error('Invalid paid amount.');
  const difference = paidAmount - sale.paid_amount;
  const next = { ...sale, paid_amount: paidAmount, credit_amount: sale.total - paidAmount };
  const changes = [{ type: 'sales', record: next }];
  if (sale.customerId && difference !== 0) {
    const customer = await getCustomer(sale.customerId);
    if (difference > 0 && customer.balance < difference) {
      throw new Error('This customer has already repaid part of this credit. The paid amount cannot be increased safely.');
    }
    if (difference < 0 && customer.credit_limit > 0 && customer.balance - difference > customer.credit_limit) {
      throw new Error('Credit limit exceeded.');
    }
    changes.push({ type: 'customers', record: { ...customer, balance: customer.balance - difference } });
    changes.push({ type: 'ledger', record: {
      id: payment.idempotencyKey, customerId: customer.id, type: difference < 0 ? 'credit_sale' : 'payment',
      idempotencyKey: `${payment.idempotencyKey}:ledger`,
      amount: -difference, ref_type: 'sale_adjustment', ref_id: sale.id,
      note: 'Sale payment updated', created_at: Date.now(),
    } });
  } else if (difference !== 0) {
    throw new Error('A customer account is required to change this sale’s credit.');
  }
  const allPayments = await listRecords('payments');
  for (const previous of allPayments.filter((row) => String(row.saleId) === String(sale.id) && row.kind === 'sale' && row.status !== 'reversed')) {
    changes.push({ type: 'payments', record: { ...previous, status: 'reversed' } });
  }
  if (paidAmount > 0) {
    changes.push({ type: 'payments', record: {
      id: `${payment.idempotencyKey}:payment`, kind: 'sale', saleId: sale.id, customerId: sale.customerId,
      idempotencyKey: `${payment.idempotencyKey}:payment`, method: payment.method, amount: paidAmount,
      status: 'ok', reference: 'Sale payment adjustment', created_at: Date.now(),
    } });
  }
  await commitLocalChanges(changes, {
    id: payment.idempotencyKey, type: 'sale.payment', payload: { saleId: String(saleId), payment },
  });
  triggerSync();
  return next;
}

export async function cancelSale(saleId, reason) {
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  const sale = await getRecord('sales', saleId);
  if (!sale) throw new Error('Sale is not available on this device.');
  if (sale.status === 'cancelled') return sale;
  const changes = [{ type: 'sales', record: { ...sale, status: 'cancelled', cancel_reason: reason.trim() } }];
  for (const item of sale.items) {
    const product = await getRecord('products', item.productId);
    if (product?.tracked) changes.push({ type: 'products', record: { ...product, stock: product.stock + item.qty } });
  }
  if (sale.customerId && sale.credit_amount > 0) {
    const customer = await getCustomer(sale.customerId);
    changes.push({ type: 'customers', record: { ...customer, balance: Math.max(0, customer.balance - sale.credit_amount) } });
    changes.push({ type: 'ledger', record: {
      id: `cancel-${sale.id}`, customerId: customer.id, type: 'reversal', amount: -sale.credit_amount,
      idempotencyKey: `${sale.idempotencyKey}:cancel-ledger`,
      ref_type: 'sale', ref_id: sale.id, note: `Cancelled sale ${sale.receipt_no}: ${reason.trim()}`,
      created_at: Date.now(),
    } });
  }
  const payments = await listRecords('payments');
  for (const payment of payments.filter((row) => String(row.saleId) === String(sale.id) && row.kind === 'sale' && row.status !== 'reversed')) {
    changes.push({ type: 'payments', record: { ...payment, status: 'reversed' } });
  }
  await commitLocalChanges(changes, {
    id: uid(), type: 'sale.cancel', payload: { saleId: String(saleId), reason: reason.trim() },
  });
  triggerSync();
  return { sale: { ...sale, status: 'cancelled', cancel_reason: reason.trim() } };
}

export async function getRecentSales(limit = 30, from = 0, to = Date.now()) {
  let rows = await listRecords('sales');
  if (await getMeta('connectionMode', 'online') !== 'offline' && (!rows.length || !(await getMeta('lastSyncAt')))) {
    const remoteRows = await getRecentSalesOnline(Math.min(limit, 100), from, to);
    for (const row of remoteRows) await putRecord('sales', row);
    rows = rows.length ? [...rows.filter((local) => !remoteRows.some((remote) => remote.id === local.id)), ...remoteRows] : remoteRows;
  }
  return rows.map(normalizeSale)
    .filter((sale) => Number(sale.created_at) >= from && Number(sale.created_at) <= to)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

export async function addExpense(expense) {
  if (!(expense.amount > 0)) throw new Error('Enter an amount greater than 0');
  const idempotencyKey = uid();
  const created = { ...expense, id: idempotencyKey, idempotencyKey, created_at: Date.now(), status: 'pending' };
  await commitLocalChanges(
    [{ type: 'expenses', record: created }],
    { id: idempotencyKey, type: 'expense.create', payload: { ...expense, idempotencyKey } }
  );
  triggerSync();
  return created;
}

function buildLocalReport(from, to, sales, payments, expenses, customers) {
  const inRange = (row) => Number(row.created_at) >= from && Number(row.created_at) <= to;
  const completed = sales.filter((sale) => inRange(sale) && sale.status === 'completed');
  const recentPayments = payments.filter((payment) => inRange(payment) && payment.status !== 'reversed');
  const recentExpenses = expenses.filter(inRange);
  const salePayments = recentPayments.filter((payment) => payment.kind === 'sale');
  const repayments = recentPayments.filter((payment) => payment.kind === 'repayment');
  const totalSales = completed.reduce((sum, sale) => sum + sale.total, 0);
  const cashFromSales = salePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const creditSales = completed.reduce((sum, sale) => sum + sale.credit_amount, 0);
  const debtRecovered = repayments.reduce((sum, payment) => sum + payment.amount, 0);
  const expenseTotal = recentExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const cashSales = salePayments.filter((payment) => payment.method === 'Cash').reduce((sum, payment) => sum + payment.amount, 0);
  const cashRepayments = repayments.filter((payment) => payment.method === 'Cash').reduce((sum, payment) => sum + payment.amount, 0);
  const cashExpenses = recentExpenses.filter((expense) => expense.method === 'Cash').reduce((sum, expense) => sum + expense.amount, 0);
  const byMethod = new Map();
  for (const payment of recentPayments) {
    const row = byMethod.get(payment.method) || { method: payment.method, sales: 0, repayments: 0 };
    row[payment.kind === 'sale' ? 'sales' : 'repayments'] += payment.amount;
    byMethod.set(payment.method, row);
  }
  const products = new Map();
  for (const sale of completed) for (const item of sale.items) {
    const row = products.get(item.product_name) || { name: item.product_name, qty: 0, revenue: 0 };
    row.qty += item.qty;
    row.revenue += item.line_total;
    products.set(item.product_name, row);
  }
  return {
    salesCount: completed.length, totalSales, cashFromSales, creditSales, debtRecovered,
    expenses: expenseTotal, netCashMovement: cashSales + cashRepayments - cashExpenses,
    grossProfitEstimate: completed.reduce((sum, sale) =>
      sum + sale.items.reduce((subtotal, item) => subtotal + (item.unit_price - item.unit_cost) * item.qty, 0), 0),
    outstandingDebt: customers.reduce((sum, customer) => sum + Math.max(0, customer.balance), 0),
    debtorCount: customers.filter((customer) => customer.balance > 0).length,
    expectedCash: cashSales + cashRepayments - cashExpenses,
    byMethod: [...byMethod.values()],
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
    expList: recentExpenses.sort((a, b) => b.created_at - a.created_at),
  };
}

export async function getReport(from, to) {
  const [sales, payments, expenses, customers] = await Promise.all([
    listRecords('sales'), listRecords('payments'), listRecords('expenses'), listRecords('customers'),
  ]);
  const mode = await getMeta('connectionMode', 'online');
  if (mode !== 'offline' && !await getMeta('lastSyncAt')) return getReportOnline(from, to);
  if (!sales.length && mode !== 'offline') return getReportOnline(from, to);
  return buildLocalReport(from, to, sales, payments, expenses, customers);
}

export async function getConnectionMode() {
  return getMeta('connectionMode', 'online');
}

export async function setConnectionMode(mode) {
  if (mode !== 'online' && mode !== 'offline') throw new Error('Invalid connection mode.');
  await setMeta('connectionMode', mode);
  if (mode === 'online') {
    const { getOutbox, updateOutbox } = await import('../db');
    for (const item of await getOutbox()) {
      if (item.status === 'failed') await updateOutbox(item.id, 'pending');
    }
    triggerSync();
  }
  return mode;
}

export async function getSyncStatus() {
  const outbox = await (await import('../db')).getOutbox();
  const lastSyncAt = await getMeta('lastSyncAt');
  const active = await getMeta('syncActive', 'false');
  const processed = Number(await getMeta('syncProcessed', '0'));
  const total = Number(await getMeta('syncTotal', '0'));
  return {
    pending: outbox.filter((item) => item.status === 'pending').length,
    failed: outbox.filter((item) => item.status === 'failed').length,
    active: active === 'true',
    processed,
    total,
    percent: total === 0 ? 100 : Math.min(100, Math.round((processed / total) * 100)),
    lastSyncAt: lastSyncAt ? Number(lastSyncAt) : null,
    items: outbox,
    syncError: await getMeta('syncError', ''),
    imageCacheFailures: Number(await getMeta('imageCacheFailures', '0')),
  };
}

export async function getBackendAvailability() {
  try {
    const result = await get('/health');
    return { reachable: true, database: result?.database || 'unknown' };
  } catch (error) {
    return { reachable: false, database: 'unknown', error: error.message || String(error) };
  }
}

export async function syncNow() {
  const { syncNow: runSync } = await import('../db/sync');
  return runSync();
}

export async function retrySync() {
  const { getOutbox, updateOutbox } = await import('../db');
  const items = await getOutbox();
  for (const item of items) if (item.status === 'failed') await updateOutbox(item.id, 'pending');
  return syncNow();
}

export async function downloadSnapshot() {
  return refreshSnapshot();
}
