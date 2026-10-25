import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDb, BUSINESS_ID } from './index';

const remoteId = (value) => String(value?._id ?? value?.id ?? '');

async function existingLocalImage(uri) {
  if (!uri || !/^file:\/\//i.test(uri)) return null;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? uri : null;
}

async function localIdFor(db, table, remote) {
  if (!remote) return null;
  const row = await db.getFirstAsync(`SELECT id FROM ${table} WHERE remote_id = ? OR id = ? LIMIT 1`, [remote, remote]);
  return row?.id || remote;
}

async function cacheImage(url, localId, priorUri, downloadForOffline) {
  if (!url) {
    if (priorUri?.startsWith('data:image/')) return priorUri;
    return existingLocalImage(priorUri);
  }

  if (!downloadForOffline) {
    return (await existingLocalImage(priorUri)) || url;
  }

  if (Platform.OS === 'web') {
    if (priorUri?.startsWith('data:image/')) return priorUri;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Product image download failed (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Product image download completed without image data.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Product image could not be saved for offline use.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }

  if (!FileSystem.documentDirectory) {
    throw new Error('The app document folder is unavailable for offline image storage.');
  }

  if (!/^https?:\/\//i.test(url)) {
    return (await existingLocalImage(url)) || existingLocalImage(priorUri);
  }

  const dir = `${FileSystem.documentDirectory}product-images/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const extension = /\.([a-z0-9]{1,5})$/i.exec(url.split(/[?#]/, 1)[0])?.[1]?.toLowerCase();
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension) ? extension : 'jpg';
  const hashString = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(16);
  };
  const path = `${dir}${hashString(localId)}-${hashString(url)}.${ext}`;
  const existingPrior = await existingLocalImage(priorUri);
  if (existingPrior) return existingPrior;

  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && info.size > 0) return path;
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });

  const result = await FileSystem.downloadAsync(url, path);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Product image download failed (HTTP ${result.status}).`);
  }
  const downloaded = await FileSystem.getInfoAsync(path);
  if (!downloaded.exists || !downloaded.size) {
    throw new Error('Product image download completed without saving image data.');
  }
  return path;
}

export async function cacheSnapshot(snapshot, onProgress = () => {}, { downloadImages = false } = {}) {
  const db = await getDb();
  const products = snapshot.products || [];
  const cachedProducts = [];
  let completed = 0;
  for (const product of products) {
    const rid = remoteId(product);
    const existing = await db.getFirstAsync('SELECT id, image_url, remote_image_url FROM products WHERE remote_id = ? OR id = ? LIMIT 1', [rid, rid]);
    const remoteImage = product.image_url || product.imageUrl;
    const localImage = await cacheImage(
      remoteImage,
      existing?.id || rid,
      existing?.remote_image_url === remoteImage ? existing?.image_url : null,
      downloadImages
    );
    cachedProducts.push({ ...product, remoteId: rid, localId: existing?.id || rid, localImage });
    completed += 1;
    onProgress({ stage: 'Downloading product images', completed, total: products.length });
  }

  for (const product of cachedProducts) {
      const p = product;
      const pending = await db.getFirstAsync(
        "SELECT id FROM sync_queue WHERE entity = 'product' AND entity_id = ? AND status != 'done' LIMIT 1",
        [p.localId]
      );
      if (pending) continue;
      await db.runAsync(
        `INSERT INTO products
         (id, business_id, name, category, unit, price, cost, low_stock_threshold, tracked, active, created_at, barcode, image_url, remote_image_url, remote_id, base_stock)
         VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, category=excluded.category, unit=excluded.unit, price=excluded.price,
         cost=excluded.cost, low_stock_threshold=excluded.low_stock_threshold, tracked=excluded.tracked,
         active=1, barcode=excluded.barcode, image_url=excluded.image_url,
         remote_image_url=excluded.remote_image_url, remote_id=excluded.remote_id, base_stock=excluded.base_stock`,
        [
          p.localId, BUSINESS_ID, p.name, p.category || 'Other', p.unit || 'unit', p.price, p.cost || 0,
          p.low_stock_threshold ?? p.lowStockThreshold ?? 0, p.tracked ? 1 : 0, p.created_at || Date.now(),
          p.barcode || null, p.localImage, p.image_url || p.imageUrl || null, p.remoteId, Number(p.stock || 0),
        ]
      );
  }

  for (const customer of snapshot.customers || []) {
      const rid = remoteId(customer);
      const cid = await localIdFor(db, 'customers', rid);
      const pending = await db.getFirstAsync(
        "SELECT id FROM sync_queue WHERE entity = 'customer' AND entity_id = ? AND status != 'done' LIMIT 1",
        [cid]
      );
      if (pending) continue;
      await db.runAsync(
        `INSERT INTO customers (id, business_id, name, phone, code, credit_limit, notes, active, created_at, remote_id)
         VALUES (?,?,?,?,?,?,?,1,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, code=excluded.code,
         credit_limit=excluded.credit_limit, notes=excluded.notes, active=1, remote_id=excluded.remote_id`,
        [cid, BUSINESS_ID, customer.name, customer.phone || null, customer.code || null, customer.credit_limit ?? customer.creditLimit ?? 0,
          customer.notes || null, customer.created_at || Date.now(), rid]
      );
  }

  for (const sale of snapshot.sales || []) {
      const rid = remoteId(sale);
      const localSale = await db.getFirstAsync(
        'SELECT id FROM sales WHERE remote_id = ? OR idempotency_key = ? LIMIT 1',
        [rid, sale.idempotencyKey || '']
      );
      const saleLocalId = localSale?.id || rid;
      const pending = await db.getFirstAsync(
        "SELECT id FROM sync_queue WHERE entity = 'sale' AND entity_id = ? AND status != 'done' LIMIT 1",
        [saleLocalId]
      );
      const customerId = sale.customerId ? await localIdFor(db, 'customers', String(sale.customerId)) : null;
      if (!pending) await db.runAsync(
        `INSERT INTO sales
         (id, business_id, receipt_no, cashier_id, customer_id, customer_name, total, paid_amount, credit_amount, status, cancel_reason, idempotency_key, sync_status, created_at, remote_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET receipt_no=excluded.receipt_no, customer_id=excluded.customer_id,
         customer_name=excluded.customer_name,
         total=excluded.total, paid_amount=excluded.paid_amount, credit_amount=excluded.credit_amount,
         status=excluded.status, cancel_reason=excluded.cancel_reason, remote_id=excluded.remote_id`,
        [saleLocalId, BUSINESS_ID, sale.receipt_no, 'online', customerId, sale.customer_name || null, sale.total, sale.paid_amount, sale.credit_amount,
          sale.status || 'completed', sale.cancel_reason || null, sale.idempotencyKey || `remote-${rid}`, 'done', sale.created_at, rid]
      );
      for (const item of sale.items || []) {
        const productId = await localIdFor(db, 'products', String(item.productId));
        const itemId = `${saleLocalId}-${String(item.productId)}`;
        await db.runAsync(
          `INSERT INTO sale_items (id, sale_id, product_id, product_name, unit_price, unit_cost, qty, line_total)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET qty=excluded.qty, line_total=excluded.line_total`,
          [itemId, saleLocalId, productId, item.product_name, item.unit_price, item.unit_cost || 0, item.qty, item.line_total]
        );
      }
  }

  for (const movement of snapshot.stockMovements || []) {
      const mid = remoteId(movement);
      const productId = await localIdFor(db, 'products', String(movement.productId));
      const queuedMovement = movement.idempotencyKey
        ? await db.getFirstAsync('SELECT entity_id FROM sync_queue WHERE id = ?', [movement.idempotencyKey])
        : null;
      let movementId = queuedMovement?.entity_id || null;
      if (!movementId && movement.refId) {
        const sale = await db.getFirstAsync('SELECT id FROM sales WHERE remote_id = ? OR id = ?', [String(movement.refId), String(movement.refId)]);
        if (sale) {
          const localMovement = await db.getFirstAsync(
            'SELECT id FROM stock_movements WHERE product_id = ? AND ref_id = ? AND qty = ? LIMIT 1',
            [productId, sale.id, movement.qty]
          );
          movementId = localMovement?.id || null;
        }
      }
      movementId ||= mid;
      await db.runAsync(
        `INSERT INTO stock_movements (id, business_id, product_id, type, qty, note, ref_id, created_at, remote_id)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id`,
        [movementId, BUSINESS_ID, productId, movement.type, movement.qty, movement.note || null, movement.refId || null, movement.created_at, mid]
      );
  }

  for (const entry of snapshot.ledger || []) {
      const lid = remoteId(entry);
      const customerId = await localIdFor(db, 'customers', String(entry.customerId));
      let localLedgerId = lid;
      if (entry.ref_type === 'sale' && entry.ref_id) {
        const localSale = await db.getFirstAsync('SELECT id FROM sales WHERE remote_id = ? OR id = ?', [String(entry.ref_id), String(entry.ref_id)]);
        if (localSale) {
          const existing = await db.getFirstAsync(
            'SELECT id FROM customer_ledger WHERE ref_type = ? AND ref_id = ? AND type = ? AND amount = ? LIMIT 1',
            ['sale', localSale.id, entry.type, entry.amount]
          );
          if (existing) localLedgerId = existing.id;
        }
      } else if (entry.ref_type === 'sale_adjustment' && entry.ref_id) {
        const localSale = await db.getFirstAsync('SELECT id FROM sales WHERE remote_id = ? OR id = ?', [String(entry.ref_id), String(entry.ref_id)]);
        if (localSale) {
          const existing = await db.getFirstAsync(
            'SELECT id FROM customer_ledger WHERE ref_type = ? AND ref_id = ? AND type = ? AND amount = ? LIMIT 1',
            ['sale_adjustment', localSale.id, entry.type, entry.amount]
          );
          if (existing) localLedgerId = existing.id;
        }
      } else if (entry.ref_type === 'payment' && entry.ref_id) {
        const serverPayment = (snapshot.payments || []).find((payment) => remoteId(payment) === String(entry.ref_id));
        const localPayment = serverPayment?.idempotencyKey
          ? await db.getFirstAsync('SELECT id FROM payments WHERE idempotency_key = ?', [serverPayment.idempotencyKey])
          : null;
        if (localPayment) {
          const existing = await db.getFirstAsync(
            'SELECT id FROM customer_ledger WHERE ref_type = ? AND ref_id = ? AND type = ? AND amount = ? LIMIT 1',
            ['payment', localPayment.id, entry.type, entry.amount]
          );
          if (existing) localLedgerId = existing.id;
        }
      } else if (entry.type === 'opening') {
        const existing = await db.getFirstAsync(
          'SELECT id FROM customer_ledger WHERE customer_id = ? AND type = ? AND amount = ? LIMIT 1',
          [customerId, entry.type, entry.amount]
        );
        if (existing) localLedgerId = existing.id;
      }
      await db.runAsync(
        `INSERT INTO customer_ledger (id, business_id, customer_id, type, amount, ref_type, ref_id, note, created_at, remote_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id`,
        [localLedgerId, BUSINESS_ID, customerId, entry.type, entry.amount, entry.ref_type || null, entry.ref_id || null, entry.note || null, entry.created_at, lid]
      );
  }

  for (const payment of snapshot.payments || []) {
      const pid = remoteId(payment);
      const customerId = payment.customerId ? await localIdFor(db, 'customers', String(payment.customerId)) : null;
      const localPayment = payment.idempotencyKey
        ? await db.getFirstAsync('SELECT id FROM payments WHERE idempotency_key = ?', [payment.idempotencyKey])
        : null;
      const sale = payment.saleId
        ? await db.getFirstAsync('SELECT id FROM sales WHERE remote_id = ? OR id = ?', [String(payment.saleId), String(payment.saleId)])
        : null;
      const saleId = sale?.id || null;
      await db.runAsync(
        `INSERT INTO payments (id, business_id, kind, sale_id, customer_id, method, amount, reference, status, idempotency_key, created_at, remote_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id, status=excluded.status`,
        [localPayment?.id || pid, BUSINESS_ID, payment.kind, saleId, customerId, payment.method, payment.amount, payment.reference || null,
          payment.status || 'ok', payment.idempotencyKey || `remote-${pid}`, payment.created_at, pid]
      );
  }

  for (const expense of snapshot.expenses || []) {
      const eid = remoteId(expense);
      const existingExpense = expense.idempotencyKey
        ? await db.getFirstAsync('SELECT id FROM expenses WHERE idempotency_key = ?', [expense.idempotencyKey])
        : null;
      await db.runAsync(
        `INSERT INTO expenses (id, business_id, category, amount, method, note, created_by, created_at, idempotency_key, remote_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id`,
        [existingExpense?.id || eid, BUSINESS_ID, expense.category, expense.amount, expense.method, expense.note || null, 'online', expense.created_at, expense.idempotencyKey || `remote-${eid}`, eid]
      );
  }
  if (snapshot.syncedAt) {
      await db.runAsync(
        `INSERT INTO sync_meta (entity, last_synced_at) VALUES ('snapshot', ?)
         ON CONFLICT(entity) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
        [snapshot.syncedAt]
      );
  }
}
