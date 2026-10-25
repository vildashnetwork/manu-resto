import { Router } from 'express';
import mongoose from 'mongoose';
import {
  Customer,
  Expense,
  Ledger,
  Payment,
  Product,
  Sale,
  SaleAdjustment,
  Setting,
  StockMovement,
} from './models.js';
import { notifyAdmin } from './email.js';

const router = Router();
const METHODS = ['Cash', 'MTN MoMo', 'Xcash', 'Orange Money', 'Bank transfer'];
const now = () => Date.now();

function httpError(status, message, code, details) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function isId(value) {
  return mongoose.isValidObjectId(value);
}

function parseRange(query) {
  const from = Number(query.from ?? 0);
  const to = Number(query.to ?? Date.now());
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw httpError(400, 'Invalid date range.');
  }
  return { $gte: from, $lte: to };
}

function serializeProduct(product) {
  const value = product.toObject ? product.toObject() : product;
  return {
    ...value,
    id: String(value._id),
    low_stock_threshold: value.lowStockThreshold,
    image_url: value.imageUrl,
  };
}

function serializeCustomer(customer) {
  const value = customer.toObject ? customer.toObject() : customer;
  return {
    ...value,
    id: String(value._id),
    credit_limit: value.creditLimit,
  };
}

function serializeSale(sale) {
  const value = sale.toObject ? sale.toObject() : sale;
  return {
    ...value,
    id: String(value._id),
    created_at: value.created_at,
  };
}

function serializeSetting(setting) {
  return {
    adminEmail: setting.adminEmail,
    notifications: setting.notifications,
    senderEmail: process.env.BREVO_SENDER_EMAIL || '',
    senderConfigured: Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL),
  };
}

function getSettings() {
  return Setting.findByIdAndUpdate(
    'main',
    { $setOnInsert: {} },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function withTransaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

router.get('/settings', asyncRoute(async (req, res) => {
  res.json({ settings: serializeSetting(await getSettings()) });
}));

router.put('/settings', asyncRoute(async (req, res) => {
  const { adminEmail, notifications } = req.body;
  if (typeof adminEmail !== 'string') throw httpError(400, 'A notification email address is required.');
  const normalizedEmail = adminEmail.trim().toLowerCase();
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw httpError(400, 'Enter a valid notification email address.');
  }
  if (!notifications || typeof notifications !== 'object' || Array.isArray(notifications)) {
    throw httpError(400, 'Notification preferences are required.');
  }
  for (const key of ['lowStock', 'creditDebt', 'expenses']) {
    if (typeof notifications[key] !== 'boolean') throw httpError(400, `Invalid ${key} notification preference.`);
  }

  const setting = await Setting.findByIdAndUpdate(
    'main',
    { $set: { adminEmail: normalizedEmail, notifications } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ settings: serializeSetting(setting) });
}));

router.get('/sync/snapshot', asyncRoute(async (req, res) => {
  const [products, customers, sales, payments, ledger, stockMovements, expenses] = await Promise.all([
    Product.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
    Customer.find({ active: true }).sort({ name: 1 }).lean(),
    Sale.find({}).sort({ created_at: 1 }).lean(),
    Payment.find({}).sort({ created_at: 1 }).lean(),
    Ledger.find({}).sort({ created_at: 1 }).lean(),
    StockMovement.find({}).sort({ created_at: 1 }).lean(),
    Expense.find({}).sort({ created_at: 1 }).lean(),
  ]);
  res.json({
    snapshot: {
      products: products.map(serializeProduct),
      customers: customers.map(serializeCustomer),
      sales: sales.map(serializeSale),
      payments,
      ledger,
      stockMovements,
      expenses,
      syncedAt: now(),
    },
  });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const products = await Product.find({ active: true }).sort({ category: 1, name: 1 }).lean();
  res.json({ products: products.map(serializeProduct) });
}));

router.post('/products', asyncRoute(async (req, res) => {
  const { name, category, unit, price, cost, lowStockThreshold, threshold, tracked, openingStock, imageUrl, barcode, syncKey } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw httpError(400, 'Product name is required.');
  if (!Number.isSafeInteger(price) || price < 1) throw httpError(400, 'Selling price must be a positive whole number.');
  if (!imageUrl || typeof imageUrl !== 'string' || !/^https:\/\//i.test(imageUrl)) {
    throw httpError(400, 'A valid HTTPS product image URL is required.');
  }
  const normalizedBarcode = typeof barcode === 'string' ? barcode.trim() || null : null;
  if (typeof syncKey === 'string' && syncKey.trim()) {
    const duplicate = await Product.findOne({ syncKey: syncKey.trim(), active: true });
    if (duplicate) return res.json({ product: serializeProduct(duplicate), duplicate: true });
  }
  if (normalizedBarcode && await Product.exists({ barcode: normalizedBarcode })) {
    throw httpError(409, 'That barcode is already assigned to another product.');
  }
  const initialStock = Number(openingStock || 0);
  if (!Number.isSafeInteger(initialStock) || initialStock < 0) throw httpError(400, 'Opening stock must be a non-negative whole number.');

  const product = await withTransaction(async (session) => {
    const [created] = await Product.create([{
      name: name.trim(),
      category: typeof category === 'string' && category.trim() ? category.trim() : 'Other',
      unit: typeof unit === 'string' && unit.trim() ? unit.trim() : 'unit',
      price,
      cost: Number.isSafeInteger(cost) && cost >= 0 ? cost : 0,
      barcode: normalizedBarcode,
      lowStockThreshold: Number.isSafeInteger(lowStockThreshold ?? threshold) && (lowStockThreshold ?? threshold) >= 0
        ? (lowStockThreshold ?? threshold)
        : 0,
      tracked: Boolean(tracked),
      stock: Boolean(tracked) ? initialStock : 0,
      imageUrl,
      syncKey: typeof syncKey === 'string' ? syncKey.trim() || null : null,
    }], { session, ordered: true });

    if (created.tracked && initialStock > 0) {
      await StockMovement.create([{
        productId: created._id,
        type: 'opening',
        qty: initialStock,
        note: 'Opening stock',
      }], { session, ordered: true });
    }
    return created;
  });

  if (product.tracked && product.lowStockThreshold > 0 && product.stock <= product.lowStockThreshold) {
    void notifyAdmin('lowStock', 'Low stock alert', `${product.name} has ${product.stock} ${product.unit || 'units'} remaining (threshold: ${product.lowStockThreshold}).`);
  }
  res.status(201).json({ product: serializeProduct(product) });
}));

router.put('/products/:id', asyncRoute(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid product ID.');
  const updates = {};
  for (const field of ['price', 'cost', 'lowStockThreshold']) {
    if (req.body[field] !== undefined) {
      if (!Number.isSafeInteger(req.body[field]) || req.body[field] < (field === 'price' ? 1 : 0)) {
        throw httpError(400, `Invalid ${field}.`);
      }
      updates[field] = req.body[field];
    }
  }
  for (const field of ['name', 'category', 'unit']) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== 'string' || !req.body[field].trim()) throw httpError(400, `Invalid ${field}.`);
      updates[field] = req.body[field].trim();
    }
  }
  if (req.body.imageUrl !== undefined) {
    if (typeof req.body.imageUrl !== 'string' || !/^https:\/\//i.test(req.body.imageUrl)) {
      throw httpError(400, 'A valid HTTPS product image URL is required.');
    }
    updates.imageUrl = req.body.imageUrl;
  }
  if (req.body.barcode !== undefined) {
    const barcode = typeof req.body.barcode === 'string' ? req.body.barcode.trim() || null : null;
    if (barcode && await Product.exists({ barcode, _id: { $ne: req.params.id } })) {
      throw httpError(409, 'That barcode is already assigned to another product.');
    }
    updates.barcode = barcode;
  }
  if (!Object.keys(updates).length) throw httpError(400, 'No supported product fields to update.');
  const previous = await Product.findOne({ _id: req.params.id, active: true }).lean();
  if (!previous) throw httpError(404, 'Product not found.');
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, active: true },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!product) throw httpError(404, 'Product not found.');
  const wasAboveThreshold = previous.tracked && previous.lowStockThreshold > 0 && previous.stock > previous.lowStockThreshold;
  const isAtOrBelowThreshold = product.tracked && product.lowStockThreshold > 0 && product.stock <= product.lowStockThreshold;
  if (wasAboveThreshold && isAtOrBelowThreshold) {
    void notifyAdmin('lowStock', 'Low stock alert', `${product.name} has ${product.stock} ${product.unit || 'units'} remaining (threshold: ${product.lowStockThreshold}).`);
  }
  res.json({ product: serializeProduct(product) });
}));

router.post('/stock/movements', asyncRoute(async (req, res) => {
  const { productId, type, qty, note, idempotencyKey } = req.body;
  if (!isId(productId)) throw httpError(400, 'Invalid product ID.');
  if (!Number.isSafeInteger(qty) || qty === 0) throw httpError(400, 'Quantity must be a non-zero whole number.');
  const addTypes = new Set(['purchase', 'adjust_up']);
  const removeTypes = new Set(['wastage', 'damage', 'complimentary', 'adjust_down']);
  if (!addTypes.has(type) && !removeTypes.has(type)) throw httpError(400, 'Invalid stock movement type.');
  if ((addTypes.has(type) && qty < 0) || (removeTypes.has(type) && qty > 0)) {
    throw httpError(400, 'Quantity sign does not match the stock movement type.');
  }
  if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const duplicate = await StockMovement.findOne({ idempotencyKey: idempotencyKey.trim() });
    if (duplicate) {
      const product = await Product.findById(productId);
      return res.json({ duplicate: true, product: product ? serializeProduct(product) : null });
    }
  }

  const result = await withTransaction(async (session) => {
    const filter = { _id: productId, active: true, tracked: true };
    if (qty < 0) filter.stock = { $gte: Math.abs(qty) };
    const before = await Product.findOne(filter).session(session);
    if (!before) {
      const exists = await Product.exists({ _id: productId, active: true }).session(session);
      if (!exists) throw httpError(404, 'Product not found.');
      throw httpError(409, 'Insufficient stock or stock tracking is disabled.');
    }
    const updated = await Product.findOneAndUpdate(filter, { $inc: { stock: qty } }, { new: true, session });
    if (!updated) {
      throw httpError(409, 'Insufficient stock or stock tracking is disabled.');
    }
    await StockMovement.create([{
      productId,
      type,
      qty,
      note: typeof note === 'string' ? note.trim() || null : null,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey.trim() || null : null,
    }], { session, ordered: true });
    return {
      product: updated,
      becameLow: before.lowStockThreshold > 0 && before.stock > before.lowStockThreshold && updated.stock <= updated.lowStockThreshold,
    };
  });
  if (result.becameLow) {
    void notifyAdmin('lowStock', 'Low stock alert', `${result.product.name} has ${result.product.stock} ${result.product.unit || 'units'} remaining (threshold: ${result.product.lowStockThreshold}).`);
  }
  res.status(201).json({ product: serializeProduct(result.product) });
}));

router.get('/customers', asyncRoute(async (req, res) => {
  const customers = await Customer.find({ active: true }).sort({ name: 1 }).lean();
  res.json({ customers: customers.map(serializeCustomer) });
}));

router.post('/customers', asyncRoute(async (req, res) => {
  const { name, phone, code, creditLimit, openingDebt, notes, syncKey } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw httpError(400, 'Customer name is required.');
  const limit = creditLimit ?? 0;
  const debt = openingDebt ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 0) throw httpError(400, 'Credit limit must be a non-negative whole number.');
  if (!Number.isSafeInteger(debt) || debt < 0) throw httpError(400, 'Opening debt must be a non-negative whole number.');
  if (typeof syncKey === 'string' && syncKey.trim()) {
    const duplicate = await Customer.findOne({ syncKey: syncKey.trim(), active: true });
    if (duplicate) return res.json({ customer: serializeCustomer(duplicate), duplicate: true });
  }

  const customer = await withTransaction(async (session) => {
    const [created] = await Customer.create([{
      name: name.trim(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      code: typeof code === 'string' ? code.trim() || null : null,
      creditLimit: limit,
      balance: debt,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      syncKey: typeof syncKey === 'string' ? syncKey.trim() || null : null,
    }], { session, ordered: true });
    if (debt > 0) {
      await Ledger.create([{
        customerId: created._id,
        type: 'opening',
        amount: debt,
        ref_type: 'migration',
        note: 'Opening balance (migrated from paper book)',
      }], { session, ordered: true });
    }
    return created;
  });
  if (debt > 0) {
    void notifyAdmin('creditDebt', 'Customer debt added', `${customer.name} has an opening debt of FCFA ${debt.toLocaleString()}. Current balance: FCFA ${customer.balance.toLocaleString()}.`);
  }
  res.status(201).json({ customer: serializeCustomer(customer) });
}));

router.get('/customers/:id', asyncRoute(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid customer ID.');
  const customer = await Customer.findOne({ _id: req.params.id, active: true });
  if (!customer) throw httpError(404, 'Customer not found.');
  res.json({ customer: serializeCustomer(customer) });
}));

router.get('/customers/:id/statement', asyncRoute(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid customer ID.');
  const customer = await Customer.exists({ _id: req.params.id, active: true });
  if (!customer) throw httpError(404, 'Customer not found.');
  const entries = await Ledger.find({ customerId: req.params.id }).sort({ created_at: 1, _id: 1 }).lean();
  let balance = 0;
  const statement = entries.map((entry) => {
    balance += entry.amount;
    return { ...entry, id: String(entry._id), balance };
  }).reverse();
  res.json({ statement });
}));

router.post('/payments/repayments', asyncRoute(async (req, res) => {
  const { idempotencyKey, customerId, amount, method, reference } = req.body;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw httpError(400, 'Idempotency key is required.');
  if (!isId(customerId)) throw httpError(400, 'Select a valid customer.');
  if (!Number.isSafeInteger(amount) || amount < 1) throw httpError(400, 'Amount must be a positive whole number.');
  if (!METHODS.includes(method)) throw httpError(400, 'Invalid payment method.');

  const existing = await Payment.findOne({ idempotencyKey: idempotencyKey.trim() });
  if (existing) return res.json({ duplicate: true, paymentId: String(existing._id) });

  try {
    const result = await withTransaction(async (session) => {
      const customer = await Customer.findOne({ _id: customerId, active: true }).session(session);
      if (!customer) throw httpError(404, 'Customer not found.');
      if (amount > customer.balance) throw httpError(400, `Amount exceeds outstanding balance (${customer.balance}).`);

      const [payment] = await Payment.create([{
        kind: 'repayment',
        customerId,
        method,
        amount,
        reference: typeof reference === 'string' ? reference.trim() || null : null,
        idempotencyKey: idempotencyKey.trim(),
      }], { session, ordered: true });
      await Customer.updateOne({ _id: customerId }, { $inc: { balance: -amount } }, { session });
      await Ledger.create([{
        customerId,
        type: 'payment',
        amount: -amount,
        ref_type: 'payment',
        ref_id: String(payment._id),
        note: `Repayment (${method})`,
      }], { session, ordered: true });
      return payment;
    });
    res.status(201).json({ duplicate: false, paymentId: String(result._id) });
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await Payment.findOne({ idempotencyKey: idempotencyKey.trim() });
      if (duplicate) return res.json({ duplicate: true, paymentId: String(duplicate._id) });
    }
    throw error;
  }
}));

router.post('/sales', asyncRoute(async (req, res) => {
  const { idempotencyKey, items, customerId, customerName, payments = [], allowOverLimit = false } = req.body;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw httpError(400, 'Idempotency key is required.');
  if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'The cart is empty.');
  if (!Array.isArray(payments)) throw httpError(400, 'Payments must be a list.');

  const oldSale = await Sale.findOne({ idempotencyKey: idempotencyKey.trim() });
  if (oldSale) return res.json({ sale: serializeSale(oldSale), duplicate: true });

  const preparedPayments = payments.map((payment) => {
    if (!METHODS.includes(payment.method) || !Number.isSafeInteger(payment.amount) || payment.amount < 1) {
      throw httpError(400, 'Each payment requires a valid method and positive whole-number amount.');
    }
    return { method: payment.method, amount: payment.amount };
  });

  try {
    const result = await withTransaction(async (session) => {
      const ids = items.map((item) => item.productId);
      if (ids.some((id) => !isId(id))) throw httpError(400, 'A cart item has an invalid product ID.');
      const uniqueIds = [...new Set(ids.map(String))];
      const products = await Product.find({ _id: { $in: uniqueIds }, active: true }).session(session);
      const productById = new Map(products.map((product) => [String(product._id), product]));
      if (productById.size !== uniqueIds.length) throw httpError(404, 'One or more products are no longer available.');

      const saleItems = items.map((item) => {
        if (!Number.isSafeInteger(item.qty) || item.qty < 1) throw httpError(400, 'Item quantities must be positive whole numbers.');
        const product = productById.get(String(item.productId));
        const unitPrice = item.unitPrice ?? product.price;
        if (!Number.isSafeInteger(unitPrice) || unitPrice < 1) throw httpError(400, `Invalid selling price for ${product.name}.`);
        return {
          productId: product._id,
          product_name: product.name,
          unit_price: unitPrice,
          unit_cost: product.cost,
          qty: item.qty,
          line_total: unitPrice * item.qty,
        };
      });
      const total = saleItems.reduce((sum, item) => sum + item.line_total, 0);
      const paid = preparedPayments.reduce((sum, payment) => sum + payment.amount, 0);
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paid)) throw httpError(400, 'Sale total is too large.');
      if (paid > total) throw httpError(400, 'Payments exceed the sale total.');
      const credit = total - paid;
      let customer = null;

      if (credit > 0) {
        if (!isId(customerId)) throw httpError(400, 'Select a customer to sell on credit.');
        customer = await Customer.findOne({ _id: customerId, active: true }).session(session);
        if (!customer) throw httpError(404, 'Customer not found.');
        if (customer.creditLimit > 0 && customer.balance + credit > customer.creditLimit && !allowOverLimit) {
          throw httpError(409, 'Credit limit exceeded.', 'CREDIT_LIMIT', {
            balance: customer.balance,
            limit: customer.creditLimit,
            credit,
          });
        }
      } else if (customerId && isId(customerId)) {
        customer = await Customer.findOne({ _id: customerId, active: true }).session(session);
      }

      const lowStockAlerts = [];
      for (const [productId, product] of productById) {
        if (!product.tracked) continue;
        const quantity = saleItems
          .filter((item) => String(item.productId) === productId)
          .reduce((sum, item) => sum + item.qty, 0);
        const updated = await Product.updateOne(
          { _id: product._id, active: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session }
        );
        if (updated.modifiedCount !== 1) throw httpError(409, `Not enough stock for ${product.name}.`);
        const remaining = product.stock - quantity;
        if (product.lowStockThreshold > 0 && product.stock > product.lowStockThreshold && remaining <= product.lowStockThreshold) {
          lowStockAlerts.push({ name: product.name, unit: product.unit, stock: remaining, threshold: product.lowStockThreshold });
        }
      }

      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const receiptNo = `MR-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const [created] = await Sale.create([{
        receipt_no: receiptNo,
        customerId: customer?._id ?? null,
        customer_name: customer?.name ?? (typeof customerName === 'string' ? customerName.trim() || null : null),
        items: saleItems,
        total,
        paid_amount: paid,
        credit_amount: credit,
        idempotencyKey: idempotencyKey.trim(),
      }], { session, ordered: true });

      if (preparedPayments.length > 0) {
        await Payment.create(preparedPayments.map((payment, index) => ({
          kind: 'sale',
          saleId: created._id,
          customerId: customer?._id ?? null,
          ...payment,
          idempotencyKey: `${idempotencyKey.trim()}:${index}`,
        })), { session, ordered: true });
      }
      if (credit > 0) {
        await Customer.updateOne({ _id: customer._id }, { $inc: { balance: credit } }, { session });
        await Ledger.create([{
          customerId: customer._id,
          type: 'credit_sale',
          amount: credit,
          ref_type: 'sale',
          ref_id: String(created._id),
          note: `Credit sale ${receiptNo}`,
        }], { session, ordered: true });
      }
      const movements = saleItems
        .filter((item) => productById.get(String(item.productId)).tracked)
        .map((item) => ({
          productId: item.productId,
          type: 'sale',
          qty: -item.qty,
          refId: String(created._id),
        }));
      if (movements.length) await StockMovement.create(movements, { session, ordered: true });
      return {
        sale: created,
        lowStockAlerts,
        debtAlert: credit > 0
          ? { customerName: customer.name, credit, balance: customer.balance + credit }
          : null,
      };
    });
    for (const item of result.lowStockAlerts) {
      void notifyAdmin('lowStock', 'Low stock alert', `${item.name} has ${item.stock} ${item.unit || 'units'} remaining (threshold: ${item.threshold}).`);
    }
    if (result.debtAlert) {
      const { customerName: name, credit, balance } = result.debtAlert;
      void notifyAdmin('creditDebt', 'Customer debt increased', `${name}'s debt increased by FCFA ${credit.toLocaleString()}. Current balance: FCFA ${balance.toLocaleString()}.`);
    }
    res.status(201).json({ sale: serializeSale(result.sale), duplicate: false });
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await Sale.findOne({ idempotencyKey: idempotencyKey.trim() });
      if (duplicate) return res.json({ sale: serializeSale(duplicate), duplicate: true });
    }
    throw error;
  }
}));

router.put('/sales/:id/payment', asyncRoute(async (req, res) => {
  const { paidAmount, method, idempotencyKey } = req.body;
  if (!isId(req.params.id)) throw httpError(400, 'Invalid sale ID.');
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0) throw httpError(400, 'Paid amount must be a non-negative whole number.');
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw httpError(400, 'Idempotency key is required.');
  if (paidAmount > 0 && !METHODS.includes(method)) throw httpError(400, 'Choose a valid payment method.');
  const key = idempotencyKey.trim();
  const prior = await SaleAdjustment.findOne({ idempotencyKey: key });
  if (prior) {
    const sale = await Sale.findById(prior.saleId);
    return res.json({ sale: serializeSale(sale), duplicate: true });
  }

  try {
    const result = await withTransaction(async (session) => {
      const current = await Sale.findById(req.params.id).session(session);
      if (!current) throw httpError(404, 'Sale not found.');
      if (current.status !== 'completed') throw httpError(409, 'Cancelled sales cannot be edited.');
      if (paidAmount > current.total) throw httpError(400, 'Paid amount cannot exceed the sale total.');
      const nextCredit = current.total - paidAmount;
      const creditDelta = nextCredit - current.credit_amount;
      let debtAlert = null;

      if (creditDelta !== 0) {
        if (!current.customerId) throw httpError(400, 'A customer account is required to change this sale’s credit.');
        const customer = await Customer.findOne({ _id: current.customerId, active: true }).session(session);
        if (!customer) throw httpError(404, 'Sale customer not found.');
        if (creditDelta > 0 && customer.creditLimit > 0 && customer.balance + creditDelta > customer.creditLimit) {
          throw httpError(409, 'Credit limit exceeded.', 'CREDIT_LIMIT', {
            balance: customer.balance,
            limit: customer.creditLimit,
            credit: creditDelta,
          });
        }
        if (creditDelta < 0 && customer.balance < Math.abs(creditDelta)) {
          throw httpError(409, 'This customer has already repaid part of this credit. The paid amount cannot be increased safely.');
        }
        await Customer.updateOne({ _id: customer._id }, { $inc: { balance: creditDelta } }, { session });
        if (creditDelta > 0) {
          debtAlert = { customerName: customer.name, credit: creditDelta, balance: customer.balance + creditDelta };
        }
        await Ledger.create([{
          customerId: customer._id,
          type: creditDelta > 0 ? 'credit_sale' : 'payment',
          amount: creditDelta,
          ref_type: 'sale_adjustment',
          ref_id: String(current._id),
          note: `Payment adjusted for sale ${current.receipt_no}`,
        }], { session, ordered: true });
      }

      await Payment.updateMany({ saleId: current._id, kind: 'sale', status: 'ok' }, { $set: { status: 'reversed' } }, { session });
      if (paidAmount > 0) {
        await Payment.create([{
          kind: 'sale',
          saleId: current._id,
          customerId: current.customerId,
          method,
          amount: paidAmount,
          reference: 'Sale payment adjustment',
          idempotencyKey: `${key}:payment`,
        }], { session, ordered: true });
      }
      await SaleAdjustment.create([{
        saleId: current._id,
        idempotencyKey: key,
        paidAmount,
        method: paidAmount > 0 ? method : null,
      }], { session, ordered: true });
      current.paid_amount = paidAmount;
      current.credit_amount = nextCredit;
      await current.save({ session });
      return { sale: current, debtAlert };
    });
    if (result.debtAlert) {
      const { customerName: name, credit, balance } = result.debtAlert;
      void notifyAdmin('creditDebt', 'Customer debt increased', `${name}'s debt increased by FCFA ${credit.toLocaleString()}. Current balance: FCFA ${balance.toLocaleString()}.`);
    }
    res.json({ sale: serializeSale(result.sale), duplicate: false });
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await SaleAdjustment.findOne({ idempotencyKey: key });
      if (duplicate) {
        const existingSale = await Sale.findById(duplicate.saleId);
        return res.json({ sale: serializeSale(existingSale), duplicate: true });
      }
    }
    throw error;
  }
}));

router.get('/sales', asyncRoute(async (req, res) => {
  const created_at = parseRange(req.query);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '30', 10) || 30, 1), 100);
  const sales = await Sale.find({ created_at }).sort({ created_at: -1 }).limit(limit).lean();
  res.json({ sales: sales.map(serializeSale) });
}));

router.post('/sales/:id/cancel', asyncRoute(async (req, res) => {
  const { reason } = req.body;
  if (!isId(req.params.id)) throw httpError(400, 'Invalid sale ID.');
  if (typeof reason !== 'string' || !reason.trim()) throw httpError(400, 'A cancellation reason is required.');
  const currentSale = await Sale.findById(req.params.id);
  if (!currentSale) throw httpError(404, 'Sale not found.');
  if (currentSale.status === 'cancelled') {
    if (currentSale.cancel_reason === reason.trim()) return res.json({ sale: serializeSale(currentSale), duplicate: true });
    throw httpError(409, 'This sale is already cancelled.');
  }

  const sale = await withTransaction(async (session) => {
    const current = await Sale.findById(req.params.id).session(session);
    if (!current) throw httpError(404, 'Sale not found.');
    if (current.status !== 'completed') throw httpError(409, 'This sale is already cancelled.');

    for (const item of current.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product?.tracked) continue;
      await Product.updateOne({ _id: product._id }, { $inc: { stock: item.qty } }, { session });
      await StockMovement.create([{
        productId: product._id,
        type: 'sale_cancel',
        qty: item.qty,
        note: reason.trim(),
        refId: String(current._id),
      }], { session, ordered: true });
    }

    if (current.customerId && current.credit_amount > 0) {
      await Customer.updateOne({ _id: current.customerId }, { $inc: { balance: -current.credit_amount } }, { session });
      await Ledger.create([{
        customerId: current.customerId,
        type: 'reversal',
        amount: -current.credit_amount,
        ref_type: 'sale',
        ref_id: String(current._id),
        note: `Cancelled sale ${current.receipt_no}: ${reason.trim()}`,
      }], { session, ordered: true });
    }
    await Payment.updateMany({ saleId: current._id, status: 'ok' }, { $set: { status: 'reversed' } }, { session });
    current.status = 'cancelled';
    current.cancel_reason = reason.trim();
    await current.save({ session });
    return current;
  });
  res.json({ sale: serializeSale(sale) });
}));

router.post('/expenses', asyncRoute(async (req, res) => {
  const { category, amount, method, note, idempotencyKey } = req.body;
  if (typeof category !== 'string' || !category.trim()) throw httpError(400, 'Expense category is required.');
  if (!Number.isSafeInteger(amount) || amount < 1) throw httpError(400, 'Amount must be a positive whole number.');
  if (!METHODS.includes(method)) throw httpError(400, 'Invalid payment method.');
  if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const duplicate = await Expense.findOne({ idempotencyKey: idempotencyKey.trim() });
    if (duplicate) return res.json({ expense: { ...duplicate.toObject(), id: String(duplicate._id) }, duplicate: true });
  }
  const expense = await Expense.create({
    category: category.trim(),
    amount,
    method,
    note: typeof note === 'string' ? note.trim() || null : null,
    idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey.trim() || null : null,
  });
  void notifyAdmin('expenses', 'New expense recorded', `${expense.category}: FCFA ${expense.amount.toLocaleString()} (${expense.method})${expense.note ? `\n${expense.note}` : ''}.`);
  res.status(201).json({ expense: { ...expense.toObject(), id: String(expense._id) }, duplicate: false });
}));

router.get('/reports', asyncRoute(async (req, res) => {
  const created_at = parseRange(req.query);
  const [sales, payments, expenses, customers] = await Promise.all([
    Sale.find({ created_at }).lean(),
    Payment.find({ created_at, status: 'ok' }).lean(),
    Expense.find({ created_at }).lean(),
    Customer.find({ active: true }).select('balance').lean(),
  ]);

  const completed = sales.filter((sale) => sale.status === 'completed');
  const salePayments = payments.filter((payment) => payment.kind === 'sale');
  const repayments = payments.filter((payment) => payment.kind === 'repayment');
  const totalSales = completed.reduce((sum, sale) => sum + sale.total, 0);
  const cashFromSales = salePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const creditSales = completed.reduce((sum, sale) => sum + sale.credit_amount, 0);
  const debtRecovered = repayments.reduce((sum, payment) => sum + payment.amount, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const cashSales = salePayments.filter((payment) => payment.method === 'Cash').reduce((sum, payment) => sum + payment.amount, 0);
  const cashRepayments = repayments.filter((payment) => payment.method === 'Cash').reduce((sum, payment) => sum + payment.amount, 0);
  const cashExpenses = expenses.filter((expense) => expense.method === 'Cash').reduce((sum, expense) => sum + expense.amount, 0);
  const outstandingDebt = customers.reduce((sum, customer) => sum + Math.max(0, customer.balance), 0);

  const methodTotals = new Map();
  for (const payment of payments) {
    const row = methodTotals.get(payment.method) || { method: payment.method, sales: 0, repayments: 0 };
    row[payment.kind === 'sale' ? 'sales' : 'repayments'] += payment.amount;
    methodTotals.set(payment.method, row);
  }
  const productTotals = new Map();
  for (const sale of completed) {
    for (const item of sale.items) {
      const row = productTotals.get(item.product_name) || { name: item.product_name, qty: 0, revenue: 0 };
      row.qty += item.qty;
      row.revenue += item.line_total;
      productTotals.set(item.product_name, row);
    }
  }
  const grossProfitEstimate = completed.reduce(
    (total, sale) => total + sale.items.reduce((subtotal, item) => subtotal + (item.unit_price - item.unit_cost) * item.qty, 0),
    0
  );

  res.json({
    report: {
      salesCount: completed.length,
      totalSales,
      cashFromSales,
      creditSales,
      debtRecovered,
      expenses: expenseTotal,
      netCashMovement: cashSales + cashRepayments - cashExpenses,
      grossProfitEstimate,
      outstandingDebt,
      debtorCount: customers.filter((customer) => customer.balance > 0).length,
      expectedCash: cashSales + cashRepayments - cashExpenses,
      byMethod: [...methodTotals.values()],
      topProducts: [...productTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
      expList: expenses
        .sort((a, b) => b.created_at - a.created_at)
        .map((expense) => ({ ...expense, id: String(expense._id) })),
    },
  });
}));

export default router;
