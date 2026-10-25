import { getDb, BUSINESS_ID, session } from './index';
import { uid, startOfDay, receiptStamp } from '../utils';

const now = () => Date.now();

async function audit(db, { action, entity, entityId, reason = null }) {
  await db.runAsync(
    'INSERT INTO audit_logs (id, business_id, actor_id, action, entity, entity_id, reason, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [uid(), BUSINESS_ID, session.userId, action, entity, entityId, reason, now()]
  );
}

async function enqueue(db, entity, entityId, op, payload = null) {
  await db.runAsync(
    'INSERT INTO sync_queue (id, entity, entity_id, op, payload, created_at) VALUES (?,?,?,?,?,?)',
    [uid(), entity, entityId, op, payload ? JSON.stringify(payload) : null, now()]
  );
}

/* ------------------------------ Products & stock ------------------------------ */

export async function getProducts() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT p.*, p.base_stock + COALESCE((SELECT SUM(qty) FROM stock_movements m WHERE m.product_id = p.id AND m.remote_id IS NULL), 0) AS stock
     FROM products p WHERE p.active = 1 AND p.business_id = ? ORDER BY p.category, p.name`,
    [BUSINESS_ID]
  );
}

export async function createProduct({ name, category, unit, price, cost, threshold, tracked, openingStock, imageUrl, barcode }) {
  if (!name?.trim()) throw new Error('Product name is required');
  if (!(price > 0)) throw new Error('Selling price must be greater than 0');
  const db = await getDb();
  const id = uid();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO products (id, business_id, name, category, unit, price, cost, low_stock_threshold, tracked, created_at, image_url, barcode)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, BUSINESS_ID, name.trim(), category || 'Other', unit || 'unit', price, cost || 0, threshold || 0, tracked ? 1 : 0, now(), imageUrl || null, barcode || null]
    );
    await audit(db, { action: 'product.create', entity: 'product', entityId: id });
    await enqueue(db, 'product', id, 'upsert');
    if (tracked && openingStock > 0) {
      const movementId = uid();
      await db.runAsync(
        'INSERT INTO stock_movements (id, business_id, product_id, type, qty, note, created_at) VALUES (?,?,?,?,?,?,?)',
        [movementId, BUSINESS_ID, id, 'opening', openingStock, 'Opening stock', now()]
      );
      await enqueue(db, 'stock_movement', movementId, 'insert');
    }
  });
  return id;
}

export async function updateProduct(productId, product) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE products SET name = ?, category = ?, unit = ?, price = ?, cost = ?,
       low_stock_threshold = ?, image_url = ?, remote_image_url = NULL, barcode = ? WHERE id = ?`,
      [product.name.trim(), product.category || 'Other', product.unit || 'unit', product.price,
        product.cost || 0, product.threshold || 0, product.imageUrl || null, product.barcode || null, productId]
    );
    await audit(db, { action: 'product.update', entity: 'product', entityId: productId });
    await enqueue(db, 'product', productId, 'upsert');
  });
}

export async function updateProductPrice(productId, price, cost) {
  if (session.role !== 'owner') throw new Error('Only the owner can change prices');
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE products SET price = ?, cost = ? WHERE id = ?', [price, cost, productId]);
    await audit(db, { action: 'product.price_change', entity: 'product', entityId: productId, reason: `price=${price}, cost=${cost}` });
    await enqueue(db, 'product', productId, 'upsert');
  });
}

// qty is signed: + adds stock (purchase, adjust up), - removes (wastage, damage, complimentary, adjust down).
export async function addStockMovement({ productId, type, qty, note }) {
  if (!qty) throw new Error('Enter a quantity');
  const db = await getDb();
  const id = uid();
  if (qty < 0) {
    const product = await db.getFirstAsync(
      'SELECT base_stock + COALESCE((SELECT SUM(qty) FROM stock_movements WHERE product_id = products.id AND remote_id IS NULL),0) AS stock FROM products WHERE id = ? AND tracked = 1',
      [productId]
    );
    if (!product) throw new Error('Tracked product not found');
    if (product.stock < Math.abs(qty)) throw new Error('Insufficient stock.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO stock_movements (id, business_id, product_id, type, qty, note, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, BUSINESS_ID, productId, type, qty, note || null, now()]
    );
    await audit(db, { action: `stock.${type}`, entity: 'stock_movement', entityId: id, reason: note });
    await enqueue(db, 'stock_movement', id, 'insert');
  });
}

/* ---------------------------------- Customers ---------------------------------- */

const CUSTOMER_SELECT = `SELECT c.*, COALESCE((SELECT SUM(l.amount) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance
  FROM customers c`;

export async function getCustomers() {
  const db = await getDb();
  return db.getAllAsync(`${CUSTOMER_SELECT} WHERE c.active = 1 AND c.business_id = ? ORDER BY c.name`, [BUSINESS_ID]);
}

export async function getCustomer(id) {
  const db = await getDb();
  return db.getFirstAsync(`${CUSTOMER_SELECT} WHERE c.id = ?`, [id]);
}

export async function createCustomer({ name, phone, code, creditLimit, openingDebt, notes }) {
  if (!name?.trim()) throw new Error('Customer name is required');
  const db = await getDb();
  const id = uid();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO customers (id, business_id, name, phone, code, credit_limit, notes, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, BUSINESS_ID, name.trim(), phone || null, code || null, creditLimit || 0, notes || null, now()]
    );
    if (openingDebt > 0) {
      await db.runAsync(
        `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, note, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, id, 'opening', openingDebt, 'migration', 'Opening balance (migrated from paper book)', now()]
      );
    }
    await audit(db, { action: 'customer.create', entity: 'customer', entityId: id });
    await enqueue(db, 'customer', id, 'upsert');
  });
  return id;
}

export async function getStatement(customerId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC, rowid ASC',
    [customerId]
  );
  let running = 0;
  const withBalance = rows.map((r) => {
    running += r.amount;
    return { ...r, balance: running };
  });
  return withBalance.reverse(); // newest first for display
}

// A repayment is NOT a sale: it creates a payment (kind 'repayment') and a negative ledger entry.
export async function recordRepayment({ idempotencyKey, customerId, amount, method, reference }) {
  const db = await getDb();
  const dup = await db.getFirstAsync('SELECT id FROM payments WHERE idempotency_key = ?', [idempotencyKey]);
  if (dup) return { duplicate: true };
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  const customer = await getCustomer(customerId);
  if (!customer) throw new Error('Customer not found');
  if (amount > customer.balance) throw new Error(`Amount exceeds outstanding balance (${customer.balance})`);
  const paymentId = uid();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO payments (id, business_id, kind, customer_id, method, amount, reference, idempotency_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [paymentId, BUSINESS_ID, 'repayment', customerId, method, amount, reference || null, idempotencyKey, now()]
    );
    await db.runAsync(
      `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, ref_id, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uid(), BUSINESS_ID, customerId, 'payment', -amount, 'payment', paymentId, `Repayment (${method})`, now()]
    );
    await audit(db, { action: 'repayment.create', entity: 'payment', entityId: paymentId });
    await enqueue(db, 'payment', paymentId, 'insert');
  });
  return { duplicate: false, paymentId };
}

/* ------------------------------------ Sales ------------------------------------ */

export async function createSale({ idempotencyKey, items, customerId, customerName, payments, allowOverLimit = false }) {
  const db = await getDb();

  // Idempotency: a double tap or retry returns the original sale.
  const existing = await db.getFirstAsync('SELECT * FROM sales WHERE idempotency_key = ?', [idempotencyKey]);
  if (existing) {
    const existingItems = await db.getAllAsync('SELECT * FROM sale_items WHERE sale_id = ?', [existing.id]);
    return {
      sale: {
        ...existing, id: existing.id, receipt_no: existing.receipt_no, customerId: existing.customer_id,
        customer_name: existing.customer_name, items: existingItems.map((item) => ({
          productId: item.product_id, product_name: item.product_name, unit_price: item.unit_price,
          unit_cost: item.unit_cost, qty: item.qty, line_total: item.line_total,
        })),
      },
      duplicate: true,
    };
  }

  if (!items?.length) throw new Error('The cart is empty');
  for (const item of items) {
    if (!item.tracked) continue;
    const product = await db.getFirstAsync(
      'SELECT base_stock + COALESCE((SELECT SUM(qty) FROM stock_movements WHERE product_id = products.id AND remote_id IS NULL),0) AS stock FROM products WHERE id = ?',
      [item.productId]
    );
    if (!product || product.stock < item.qty) throw new Error(`Not enough stock for ${item.name}.`);
  }
  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (paid > total) throw new Error('Payments exceed the sale total');
  const credit = total - paid;
  const customer = customerId ? await getCustomer(customerId) : null;

  if (credit > 0) {
    if (!customerId) throw new Error('Select a customer to sell on credit');
    if (!customer) throw new Error('Customer not found');
    if (customer.credit_limit > 0 && customer.balance + credit > customer.credit_limit && !allowOverLimit) {
      const err = new Error('Credit limit exceeded');
      err.code = 'CREDIT_LIMIT';
      err.details = { balance: customer.balance, limit: customer.credit_limit, credit };
      throw err;
    }
  }

  const saleId = uid();
  const ts = now();
  await db.withTransactionAsync(async () => {
    const cnt = await db.getFirstAsync('SELECT COUNT(*) AS c FROM sales WHERE created_at >= ?', [startOfDay()]);
    const receiptNo = `R${receiptStamp(ts)}-${String(cnt.c + 1).padStart(3, '0')}`;

    await db.runAsync(
      `INSERT INTO sales (id, business_id, receipt_no, cashier_id, customer_id, customer_name, total, paid_amount, credit_amount, idempotency_key, created_at, allow_over_limit)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [saleId, BUSINESS_ID, receiptNo, session.userId, customerId || null, customer?.name || customerName || null, total, paid, credit, idempotencyKey, ts, allowOverLimit ? 1 : 0]
    );

    for (const i of items) {
      // Price and cost are copied onto the line so history survives later price changes.
      await db.runAsync(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, unit_price, unit_cost, qty, line_total) VALUES (?,?,?,?,?,?,?,?)',
        [uid(), saleId, i.productId, i.name, i.unitPrice, i.unitCost || 0, i.qty, i.unitPrice * i.qty]
      );
      if (i.tracked) {
        await db.runAsync(
          'INSERT INTO stock_movements (id, business_id, product_id, type, qty, ref_id, created_at) VALUES (?,?,?,?,?,?,?)',
          [uid(), BUSINESS_ID, i.productId, 'sale', -i.qty, saleId, ts]
        );
      }
    }

    for (const [index, p] of payments.entries()) {
      await db.runAsync(
        `INSERT INTO payments (id, business_id, kind, sale_id, customer_id, method, amount, idempotency_key, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, 'sale', saleId, customerId || null, p.method, p.amount, `${idempotencyKey}:${index}`, ts]
      );
    }

    if (credit > 0) {
      await db.runAsync(
        `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, ref_id, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, customerId, 'credit_sale', credit, 'sale', saleId, `Sale ${receiptNo}`, ts]
      );
    }

    await audit(db, { action: 'sale.create', entity: 'sale', entityId: saleId });
    await enqueue(db, 'sale', saleId, 'insert', { idempotencyKey });
  });

  const sale = await db.getFirstAsync('SELECT * FROM sales WHERE id = ?', [saleId]);
  const saleItems = await db.getAllAsync('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
  return {
    sale: {
      ...sale,
      id: sale.id,
      receipt_no: sale.receipt_no,
      customerId: sale.customer_id,
      customer_name: customer?.name || sale.customer_name || null,
      total: sale.total,
      paid_amount: sale.paid_amount,
      credit_amount: sale.credit_amount,
      created_at: sale.created_at,
      items: saleItems.map((item) => ({
        productId: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        qty: item.qty,
        line_total: item.line_total,
      })),
    },
    duplicate: false,
  };
}

// Cancellation is a reversal with a reason, never a silent delete.
export async function cancelSale(saleId, reason) {
  if (session.role !== 'owner') throw new Error('Only the owner can cancel a sale');
  if (!reason?.trim()) throw new Error('A reason is required');
  const db = await getDb();
  const sale = await db.getFirstAsync('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw new Error('Sale not found');
  if (sale.status !== 'completed') throw new Error('This sale is already cancelled');
  const items = await db.getAllAsync('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
  const ts = now();

  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE sales SET status = 'cancelled', cancel_reason = ?, sync_status = 'pending' WHERE id = ?", [reason.trim(), saleId]);
    await db.runAsync("UPDATE payments SET status = 'reversed' WHERE sale_id = ?", [saleId]);

    if (sale.credit_amount > 0 && sale.customer_id) {
      await db.runAsync(
        `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, ref_id, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, sale.customer_id, 'reversal', -sale.credit_amount, 'sale', saleId, `Cancelled ${sale.receipt_no}: ${reason.trim()}`, ts]
      );
    }
    for (const i of items) {
      const prod = await db.getFirstAsync('SELECT tracked FROM products WHERE id = ?', [i.product_id]);
      if (prod?.tracked) {
        await db.runAsync(
          'INSERT INTO stock_movements (id, business_id, product_id, type, qty, note, ref_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
          [uid(), BUSINESS_ID, i.product_id, 'sale_reversal', i.qty, `Cancelled ${sale.receipt_no}`, saleId, ts]
        );
      }
    }
    await audit(db, { action: 'sale.cancel', entity: 'sale', entityId: saleId, reason: reason.trim() });
    await enqueue(db, 'sale', saleId, 'cancel', { reason: reason.trim() });
  });
}

export async function getRecentSales(limit = 30, from = 0, to = Date.now()) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT s.*, COALESCE(c.name, s.customer_name) AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.created_at BETWEEN ? AND ? ORDER BY s.created_at DESC LIMIT ?`,
    [from, to, limit]
  );
}

/* ----------------------------------- Expenses ----------------------------------- */

export async function addExpense({ category, amount, method, note, idempotencyKey = uid() }) {
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
  const db = await getDb();
  const id = uid();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO expenses (id, business_id, category, amount, method, note, created_by, created_at, idempotency_key) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, BUSINESS_ID, category, amount, method, note || null, session.userId, now(), idempotencyKey]
    );
    await audit(db, { action: 'expense.create', entity: 'expense', entityId: id });
    await enqueue(db, 'expense', id, 'insert');
  });
  return { id };
}

export async function updateSalePayment(saleId, { paidAmount, method, idempotencyKey }) {
  const db = await getDb();
  const sale = await db.getFirstAsync('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw new Error('Sale not found');
  if (paidAmount > sale.total) throw new Error('Paid amount cannot exceed the sale total');
  const credit = sale.total - paidAmount;
  const delta = credit - sale.credit_amount;
  const customer = sale.customer_id ? await getCustomer(sale.customer_id) : null;
  if (delta !== 0 && !customer) throw new Error('A customer account is required to change this sale’s credit.');
  if (delta > 0 && customer.credit_limit > 0 && customer.balance + delta > customer.credit_limit) {
    const error = new Error('Credit limit exceeded');
    error.code = 'CREDIT_LIMIT';
    error.details = { balance: customer.balance, limit: customer.credit_limit, credit: delta };
    throw error;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE sales SET paid_amount = ?, credit_amount = ?, sync_status = ? WHERE id = ?', [paidAmount, credit, 'pending', saleId]);
    await db.runAsync("UPDATE payments SET status = 'reversed' WHERE sale_id = ?", [saleId]);
    if (paidAmount > 0) {
      await db.runAsync(
        `INSERT INTO payments (id, business_id, kind, sale_id, customer_id, method, amount, idempotency_key, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, 'sale', saleId, sale.customer_id, method, paidAmount, `${idempotencyKey}:payment`, now()]
      );
    }
    if (delta !== 0) {
      await db.runAsync(
        `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, ref_id, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), BUSINESS_ID, sale.customer_id, delta > 0 ? 'credit_sale' : 'payment', delta, 'sale_adjustment', saleId, 'Sale payment adjusted', now()]
      );
    }
    await enqueue(db, 'sale', saleId, 'payment', { paidAmount, method, idempotencyKey });
  });
  return { ...sale, paid_amount: paidAmount, credit_amount: credit };
}

export async function getCachedSettings() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM app_settings WHERE key = 'email_settings'");
  return row ? JSON.parse(row.value) : {
    adminEmail: '',
    notifications: { lowStock: true, creditDebt: true, expenses: true },
    senderEmail: '',
    senderConfigured: false,
  };
}

export async function saveCachedSettings(settings) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('email_settings', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(settings)]
  );
  await enqueue(db, 'settings', 'main', 'upsert', settings);
  return settings;
}

export async function cacheEmailSettings(settings) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('email_settings', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(settings)]
  );
  return settings;
}

export async function getSyncQueue() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM sync_queue WHERE status != 'done' ORDER BY created_at, rowid");
}

export async function getSyncCounts() {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN status = 'pending' OR status = 'syncing' THEN 1 ELSE 0 END) AS pending
     FROM sync_queue`
  );
}

export async function setQueueStatus(id, status, error = null) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sync_queue SET status = ?, attempts = attempts + ?, error = ? WHERE id = ?',
    [status, status === 'error' ? 1 : 0, error, id]
  );
}

export async function markQueueDone(id) {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'done', error = NULL WHERE id = ?", [id]);
}

export async function getLocalEntity(entity, id) {
  const db = await getDb();
  const table = { product: 'products', customer: 'customers', sale: 'sales', payment: 'payments', expense: 'expenses', stock_movement: 'stock_movements' }[entity];
  if (!table) throw new Error(`Unsupported local sync entity: ${entity}`);
  return db.getFirstAsync(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

/* ------------------------------------ Reports ------------------------------------ */

// Keeps sales, collections, debt recovery, expenses and profit as separate figures.
export async function getReport(from, to) {
  const db = await getDb();
  const r = [from, to];

  const sales = await db.getFirstAsync(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(credit_amount),0) AS credit
     FROM sales WHERE status = 'completed' AND created_at BETWEEN ? AND ?`, r);

  const cashFromSales = await db.getFirstAsync(
    `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='sale' AND status='ok' AND created_at BETWEEN ? AND ?`, r);

  const debtRecovered = await db.getFirstAsync(
    `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='repayment' AND status='ok' AND created_at BETWEEN ? AND ?`, r);

  const expenses = await db.getFirstAsync(
    'SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE created_at BETWEEN ? AND ?', r);

  const byMethod = await db.getAllAsync(
    `SELECT method,
       COALESCE(SUM(CASE WHEN kind='sale' THEN amount END),0) AS sales,
       COALESCE(SUM(CASE WHEN kind='repayment' THEN amount END),0) AS repayments
     FROM payments WHERE status='ok' AND created_at BETWEEN ? AND ? GROUP BY method`, r);

  const expByMethod = await db.getAllAsync(
    'SELECT method, COALESCE(SUM(amount),0) AS v FROM expenses WHERE created_at BETWEEN ? AND ? GROUP BY method', r);

  const expList = await db.getAllAsync(
    'SELECT * FROM expenses WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 20', r);

  const topProducts = await db.getAllAsync(
    `SELECT i.product_name AS name, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
     FROM sale_items i JOIN sales s ON s.id = i.sale_id
     WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?
     GROUP BY i.product_name ORDER BY qty DESC LIMIT 5`, r);

  const profit = await db.getFirstAsync(
    `SELECT COALESCE(SUM((i.unit_price - i.unit_cost) * i.qty),0) AS v
     FROM sale_items i JOIN sales s ON s.id = i.sale_id
     WHERE s.status='completed' AND s.created_at BETWEEN ? AND ?`, r);

  const outstanding = await db.getFirstAsync(
    `SELECT COALESCE(SUM(amount),0) AS total FROM customer_ledger`);
  const debtors = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM (SELECT customer_id FROM customer_ledger GROUP BY customer_id HAVING SUM(amount) > 0)`);

  const cashIn = byMethod.find((m) => m.method === 'Cash');
  const cashOut = expByMethod.find((m) => m.method === 'Cash');
  const expectedCash = (cashIn ? cashIn.sales + cashIn.repayments : 0) - (cashOut ? cashOut.v : 0);

  return {
    salesCount: sales.count,
    totalSales: sales.total,
    creditSales: sales.credit,
    cashFromSales: cashFromSales.v,
    debtRecovered: debtRecovered.v,
    expenses: expenses.v,
    netCashMovement: cashFromSales.v + debtRecovered.v - expenses.v,
    expectedCash, // cash movement only; add opening cash when counting the drawer
    grossProfitEstimate: profit.v,
    outstandingDebt: outstanding.total,
    debtorCount: debtors.n,
    byMethod,
    expList,
    topProducts,
  };
}
