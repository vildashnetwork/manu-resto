import * as SQLite from 'expo-sqlite';

let databasePromise;

export async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync('manus-resto.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS records (
          type TEXT NOT NULL,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (type, id)
        );
        CREATE TABLE IF NOT EXISTS outbox (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS outbox_order ON outbox(status, created_at);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS id_map (
          local_id TEXT PRIMARY KEY NOT NULL,
          remote_id TEXT NOT NULL
        );
      `);
      await db.runAsync(
        'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        'syncActive', 'false'
      );
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export async function putRecord(type, record) {
  if (!record?.id) throw new Error(`Cannot store ${type} without an id.`);
  const db = await database();
  await db.runAsync(
    'INSERT INTO records(type, id, data, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
    type, String(record.id), JSON.stringify(record), Date.now()
  );
}

export async function commitLocalChanges(records, operation) {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const { type, record } of records) {
      if (!record?.id) throw new Error(`Cannot store ${type} without an id.`);
      await tx.runAsync(
        'INSERT INTO records(type, id, data, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
        type, String(record.id), JSON.stringify(record), Date.now()
      );
    }
    if (operation) {
      await tx.runAsync(
        'INSERT INTO outbox(id, type, payload, created_at) VALUES(?, ?, ?, ?)',
        operation.id, operation.type, JSON.stringify(operation.payload), Date.now()
      );
    }
  });
}

export async function getRecord(type, id) {
  const db = await database();
  const row = await db.getFirstAsync('SELECT data FROM records WHERE type = ? AND id = ?', type, String(id));
  return row ? JSON.parse(row.data) : null;
}

export async function listRecords(type) {
  const db = await database();
  const rows = await db.getAllAsync('SELECT data FROM records WHERE type = ? ORDER BY updated_at DESC', type);
  return rows.map((row) => JSON.parse(row.data));
}

export async function deleteRecord(type, id) {
  const db = await database();
  await db.runAsync('DELETE FROM records WHERE type = ? AND id = ?', type, String(id));
}

export async function enqueue(type, payload, id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  const db = await database();
  await db.runAsync(
    'INSERT INTO outbox(id, type, payload, created_at) VALUES(?, ?, ?, ?)',
    id, type, JSON.stringify(payload), Date.now()
  );
  return id;
}

export async function getOutbox() {
  const db = await database();
  const rows = await db.getAllAsync('SELECT id, type, payload, status, error, created_at FROM outbox ORDER BY created_at, rowid');
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

export async function updateOutbox(id, status, error = null) {
  const db = await database();
  await db.runAsync('UPDATE outbox SET status = ?, error = ? WHERE id = ?', status, error, id);
}

export async function removeOutbox(id) {
  const db = await database();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
}

export async function getMeta(key, fallback = null) {
  const db = await database();
  const row = await db.getFirstAsync('SELECT value FROM meta WHERE key = ?', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const db = await database();
  await db.runAsync(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key, String(value)
  );
}

export async function mapId(localId, remoteId) {
  const db = await database();
  await db.runAsync(
    'INSERT INTO id_map(local_id, remote_id) VALUES(?, ?) ON CONFLICT(local_id) DO UPDATE SET remote_id=excluded.remote_id',
    String(localId), String(remoteId)
  );
}

export async function resolveId(id) {
  if (!id) return id;
  const db = await database();
  const row = await db.getFirstAsync('SELECT remote_id FROM id_map WHERE local_id = ?', String(id));
  return row?.remote_id || String(id);
}

export async function replaceRemoteSnapshot(snapshot) {
  const db = await database();
  const outbox = await getOutbox();
  const identityRows = await db.getAllAsync('SELECT local_id, remote_id FROM id_map');
  const remoteToLocal = new Map(identityRows.map((row) => [String(row.remote_id), String(row.local_id)]));
  const localRows = await db.getAllAsync('SELECT type, id, data FROM records');
  const localByIdempotency = new Map();
  for (const row of localRows) {
    const data = JSON.parse(row.data);
    if (data.idempotencyKey) localByIdempotency.set(`${row.type}:${data.idempotencyKey}`, String(row.id));
  }
  const pendingIds = new Set();
  if (outbox.some((item) => item.type === 'settings.update')) pendingIds.add('main');
  for (const item of outbox) {
    for (const key of ['productId', 'customerId', 'saleId', 'id', 'localId']) {
      if (item.payload?.[key]) pendingIds.add(String(item.payload[key]));
    }
    for (const product of item.payload?.items || []) {
      if (product.productId) pendingIds.add(String(product.productId));
    }
    if (item.payload?.product?.id) pendingIds.add(String(item.payload.product.id));
    if (item.payload?.customer?.id) pendingIds.add(String(item.payload.customer.id));
    if (item.payload?.sale?.id) pendingIds.add(String(item.payload.sale.id));
  }
  const records = Object.entries(snapshot || {}).flatMap(([type, values]) =>
    Array.isArray(values) ? values.map((value) => [type, value]) : []
  );
  const writes = [];
  for (const [type, value] of records) {
    if (!value?.id) continue;
    const remoteId = String(value.id);
    const localId = remoteToLocal.get(remoteId)
      || (value.idempotencyKey ? localByIdempotency.get(`${type}:${value.idempotencyKey}`) : null);
    if (pendingIds.has(remoteId) || (localId && pendingIds.has(localId))) continue;
    if (localId) remoteToLocal.set(remoteId, localId);
    const translated = {
      ...value,
      id: localId || remoteId,
      ...(localId ? { remoteId } : {}),
    };
    for (const field of ['customerId', 'productId', 'saleId', 'ref_id', 'refId']) {
      if (translated[field]) translated[field] = remoteToLocal.get(String(translated[field])) || String(translated[field]);
    }
    if (Array.isArray(translated.items)) {
      translated.items = translated.items.map((item) => ({
        ...item,
        productId: remoteToLocal.get(String(item.productId)) || String(item.productId),
      }));
    }
    writes.push({ type, translated, localId, remoteId });
  }
  const batchSize = 50;
  for (let offset = 0; offset < writes.length; offset += batchSize) {
    const batch = writes.slice(offset, offset + batchSize);
    await db.withExclusiveTransactionAsync(async (tx) => {
      const currentQueue = await tx.getAllAsync('SELECT type, payload FROM outbox');
      const currentPendingIds = new Set(pendingIds);
      for (const row of currentQueue) {
        const payload = JSON.parse(row.payload);
        if (row.type === 'settings.update') currentPendingIds.add('main');
        for (const key of ['productId', 'customerId', 'saleId', 'id', 'localId']) {
          if (payload[key]) currentPendingIds.add(String(payload[key]));
        }
        for (const product of payload.items || []) {
          if (product.productId) currentPendingIds.add(String(product.productId));
        }
        for (const key of ['product', 'customer', 'sale']) {
          if (payload[key]?.id) currentPendingIds.add(String(payload[key].id));
        }
      }
      for (const { type, translated, localId, remoteId } of batch) {
        if (currentPendingIds.has(remoteId) || (localId && currentPendingIds.has(localId))) continue;
        const existing = localId
          ? await tx.getFirstAsync('SELECT data FROM records WHERE type = ? AND id = ?', type, localId)
          : null;
        const existingData = existing ? JSON.parse(existing.data) : null;
        if (existingData?.localImageUri) translated.localImageUri = existingData.localImageUri;
        await tx.runAsync(
          'INSERT INTO records(type, id, data, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
          type, translated.id, JSON.stringify(translated), Date.now()
        );
      }
    });
  }
}
