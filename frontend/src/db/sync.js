import * as FileSystem from 'expo-file-system/legacy';
import { BACKEND_URL } from '../config/backend';
import { uploadProductImage } from '../api/cloudinary';
import { getDb, BUSINESS_ID } from './index';
import { cacheSnapshot } from './cache';
import {
  getLocalEntity, getSyncQueue, markQueueDone, setQueueStatus,
} from './repo';

async function api(path, method = 'GET', body) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(payload?.message || `Sync request failed (HTTP ${response.status}).`);
  return payload;
}

async function setProgress(state) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('sync_progress', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [JSON.stringify(state)]
  );
}

async function getRemoteId(table, id) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT remote_id FROM ${table} WHERE id = ?`, [id]);
  return row?.remote_id || null;
}

async function syncProduct(queue) {
  const db = await getDb();
  const product = await getLocalEntity('product', queue.entity_id);
  if (!product) throw new Error('Local product record is missing.');
  let imageUrl = product.remote_image_url || product.image_url;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    const info = await FileSystem.getInfoAsync(imageUrl);
    if (!info.exists) throw new Error(`Product image is missing from this device: ${product.name}`);
    imageUrl = await uploadProductImage(imageUrl, `${product.id}.jpg`, 'image/jpeg');
  }
  if (!imageUrl) throw new Error(`Product image is missing: ${product.name}`);
  const body = {
    name: product.name,
    category: product.category,
    unit: product.unit,
    price: product.price,
    cost: product.cost,
    lowStockThreshold: product.low_stock_threshold,
    tracked: Boolean(product.tracked),
    imageUrl,
    barcode: product.barcode || null,
  };
  const remoteId = await getRemoteId('products', product.id);
  let response;
  if (remoteId) {
    response = await api(`/products/${encodeURIComponent(remoteId)}`, 'PUT', body);
  } else {
    response = await api('/products', 'POST', { ...body, openingStock: 0, syncKey: queue.id });
  }
  const saved = response.product;
  if (!saved?.id) throw new Error('The server did not return a product identifier.');
  await db.runAsync(
    'UPDATE products SET remote_id = ?, remote_image_url = ? WHERE id = ?',
    [String(saved.id), imageUrl, product.id]
  );
}

async function syncCustomer(queue) {
  const db = await getDb();
  const customer = await getLocalEntity('customer', queue.entity_id);
  if (!customer) throw new Error('Local customer record is missing.');
  const remoteId = await getRemoteId('customers', customer.id);
  if (remoteId) return;
  const opening = await db.getFirstAsync(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM customer_ledger WHERE customer_id = ? AND type = 'opening'",
    [customer.id]
  );
  const response = await api('/customers', 'POST', {
    name: customer.name,
    phone: customer.phone,
    code: customer.code,
    creditLimit: customer.credit_limit || 0,
    openingDebt: opening?.amount || 0,
    notes: customer.notes,
    syncKey: queue.id,
  });
  if (!response.customer?.id) throw new Error('The server did not return a customer identifier.');
  await db.runAsync('UPDATE customers SET remote_id = ? WHERE id = ?', [String(response.customer.id), customer.id]);
}

async function syncStockMovement(queue) {
  const db = await getDb();
  const movement = await getLocalEntity('stock_movement', queue.entity_id);
  if (!movement) throw new Error('Local stock movement is missing.');
  if (movement.ref_id) {
    const relatedSale = await db.getFirstAsync('SELECT id FROM sales WHERE id = ?', [movement.ref_id]);
    if (relatedSale || ['sale', 'sale_reversal', 'opening'].includes(movement.type)) return;
  }
  const productId = await getRemoteId('products', movement.product_id);
  if (!productId) throw new Error('Sync the product before its stock movement.');
  const type = movement.type === 'opening' ? (movement.qty < 0 ? 'adjust_down' : 'adjust_up') : movement.type;
  await api('/stock/movements', 'POST', {
    productId,
    type,
    qty: movement.qty,
    note: movement.note,
    idempotencyKey: queue.id,
  });
  await db.runAsync('UPDATE stock_movements SET remote_id = ? WHERE id = ?', [queue.id, movement.id]);
}

async function syncSale(queue) {
  const db = await getDb();
  const sale = await getLocalEntity('sale', queue.entity_id);
  if (!sale) throw new Error('Local sale is missing.');
  const items = await db.getAllAsync('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
  const payments = await db.getAllAsync(
    "SELECT * FROM payments WHERE sale_id = ? AND kind = 'sale' AND status = 'ok'",
    [sale.id]
  );
  const customerId = sale.customer_id ? await getRemoteId('customers', sale.customer_id) : null;
  if (sale.customer_id && !customerId) throw new Error('Sync the customer before its credit sale.');
  const mappedItems = await Promise.all(items.map(async (item) => {
    const productId = await getRemoteId('products', item.product_id);
    if (!productId) throw new Error(`Sync product "${item.product_name}" before its sale.`);
    const product = await db.getFirstAsync('SELECT tracked FROM products WHERE id = ?', [item.product_id]);
    return {
      productId,
      name: item.product_name,
      unitPrice: item.unit_price,
      unitCost: item.unit_cost,
      qty: item.qty,
      tracked: Boolean(product?.tracked),
    };
  }));
  const result = await api('/sales', 'POST', {
    idempotencyKey: sale.idempotency_key,
    items: mappedItems,
    customerId,
    payments: payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
    allowOverLimit: Boolean(sale.allow_over_limit),
  });
  const saved = result.sale;
  if (!saved?.id) throw new Error('The server did not return a sale identifier.');
  await db.runAsync("UPDATE sales SET remote_id = ?, sync_status = 'done' WHERE id = ?", [String(saved.id), sale.id]);

  if (saved.credit_amount > 0) {
    const row = await db.getFirstAsync("SELECT id FROM customer_ledger WHERE ref_type = 'sale' AND ref_id = ? AND type = 'credit_sale' LIMIT 1", [sale.id]);
    if (row) {
      await db.runAsync('UPDATE customer_ledger SET remote_id = ? WHERE id = ?', [String(saved.id), row.id]);
    }
  }
  await db.runAsync(
    "UPDATE stock_movements SET remote_id = ? WHERE ref_id = ? AND type = 'sale'",
    [String(saved.id), sale.id]
  );
}

async function syncRepayment(queue) {
  const db = await getDb();
  const payment = await getLocalEntity('payment', queue.entity_id);
  if (!payment) throw new Error('Local repayment is missing.');
  const customerId = await getRemoteId('customers', payment.customer_id);
  if (!customerId) throw new Error('Sync the customer before its repayment.');
  const result = await api('/payments/repayments', 'POST', {
    idempotencyKey: payment.idempotency_key,
    customerId,
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
  });
  if (result.paymentId) await db.runAsync('UPDATE payments SET remote_id = ? WHERE id = ?', [String(result.paymentId), payment.id]);
}

async function syncExpense(queue) {
  const expense = await getLocalEntity('expense', queue.entity_id);
  if (!expense) throw new Error('Local expense is missing.');
  await api('/expenses', 'POST', {
    category: expense.category,
    amount: expense.amount,
    method: expense.method,
    note: expense.note,
    idempotencyKey: expense.idempotency_key || queue.id,
  });
}

async function syncOne(queue) {
  switch (queue.entity) {
    case 'product': return syncProduct(queue);
    case 'customer': return syncCustomer(queue);
    case 'stock_movement': return syncStockMovement(queue);
    case 'sale':
      if (queue.op === 'insert') return syncSale(queue);
      if (queue.op === 'cancel') {
        const remoteId = await getRemoteId('sales', queue.entity_id);
        if (!remoteId) throw new Error('Sync the sale before cancellation.');
        const payload = JSON.parse(queue.payload || '{}');
        return api(`/sales/${encodeURIComponent(remoteId)}/cancel`, 'POST', { reason: payload.reason });
      }
      if (queue.op === 'payment') {
        const remoteId = await getRemoteId('sales', queue.entity_id);
        if (!remoteId) throw new Error('Sync the sale before its payment adjustment.');
        const payload = JSON.parse(queue.payload || '{}');
        return api(`/sales/${encodeURIComponent(remoteId)}/payment`, 'PUT', payload);
      }
      throw new Error(`Unsupported sale operation: ${queue.op}`);
    case 'payment': return syncRepayment(queue);
    case 'expense': return syncExpense(queue);
    case 'settings': {
      const payload = JSON.parse(queue.payload || '{}');
      return api('/settings', 'PUT', payload);
    }
    default: throw new Error(`Unsupported sync entity: ${queue.entity}`);
  }
}

export async function readSyncProgress() {
  const db = await getDb();
  const state = await db.getFirstAsync("SELECT value FROM app_settings WHERE key = 'sync_progress'");
  const counts = await db.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN status='pending' OR status='syncing' THEN 1 ELSE 0 END) AS pending
     FROM sync_queue`
  );
  const lastSync = await db.getFirstAsync("SELECT last_synced_at FROM sync_meta WHERE entity = 'snapshot'");
  return {
    ...(state ? JSON.parse(state.value) : { status: 'idle', stage: 'Ready', completed: 0, total: 0, percent: 100 }),
    counts: { total: counts?.total || 0, done: counts?.done || 0, errors: counts?.errors || 0, pending: counts?.pending || 0 },
    lastSyncedAt: lastSync?.last_synced_at || null,
  };
}

let syncPromise = null;
export function syncAll(onChange = () => {}) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const initialQueue = await getSyncQueue();
    const total = initialQueue.length + 1;
    let completed = 0;
    let errors = 0;
    await setProgress({ status: 'syncing', stage: 'Preparing local changes', completed, total, percent: 0 });
    onChange(await readSyncProgress());

    for (const queue of initialQueue) {
      await setQueueStatus(queue.id, 'syncing');
      await setProgress({
        status: 'syncing',
        stage: `Syncing ${queue.entity.replace('_', ' ')}`,
        item: queue.entity_id,
        completed,
        total,
        percent: Math.floor((completed / total) * 100),
      });
      onChange(await readSyncProgress());
      try {
        await syncOne(queue);
        await markQueueDone(queue.id);
        completed += 1;
      } catch (error) {
        errors += 1;
        await setQueueStatus(queue.id, 'error', error.message || String(error));
      }
    }

    try {
      await setProgress({ status: 'syncing', stage: 'Downloading account data and product images', completed, total, percent: Math.floor((completed / total) * 100) });
      onChange(await readSyncProgress());
      const result = await api('/sync/snapshot');
      if (!result.snapshot) throw new Error('The server did not return a data snapshot.');
      await cacheSnapshot(result.snapshot, (imageProgress) => {
        const ratio = imageProgress.total ? imageProgress.completed / imageProgress.total : 1;
        void setProgress({
          status: 'syncing',
          stage: imageProgress.stage,
          completed: completed + ratio,
          total,
          percent: Math.min(99, Math.floor(((completed + ratio) / total) * 100)),
        }).catch((error) => console.error('Could not update sync progress:', error));
      }, { downloadImages: true });
      completed += 1;
    } catch (error) {
      errors += 1;
      await setProgress({ status: 'error', stage: error.message || String(error), completed, total, percent: Math.floor((completed / total) * 100) });
      onChange(await readSyncProgress());
      return await readSyncProgress();
    }

    const finalState = {
      status: errors ? 'error' : 'complete',
      stage: errors ? `${errors} item${errors === 1 ? '' : 's'} need attention` : 'All data is synced on this device.',
      completed,
      total,
      percent: Math.round((completed / total) * 100),
      errors,
    };
    await setProgress(finalState);
    onChange(await readSyncProgress());
    return await readSyncProgress();
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}
