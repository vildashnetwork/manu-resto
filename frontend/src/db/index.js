import * as SQLite from 'expo-sqlite';
import { SCHEMA } from './schema';
import { uid } from '../utils';

export const BUSINESS_ID = 'manus-resto';
export const OWNER_ID = 'owner-1';

// Placeholder session until real authentication is added (Phase 3).
export const session = { userId: OWNER_ID, role: 'owner' };

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('manus_resto.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await db.execAsync(SCHEMA);
      await ensureColumn(db, 'products', 'barcode', 'TEXT');
      await ensureColumn(db, 'products', 'image_url', 'TEXT');
      await ensureColumn(db, 'products', 'remote_image_url', 'TEXT');
      await ensureColumn(db, 'products', 'remote_id', 'TEXT');
      await ensureColumn(db, 'products', 'base_stock', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumn(db, 'customers', 'remote_id', 'TEXT');
      await ensureColumn(db, 'sales', 'remote_id', 'TEXT');
      await ensureColumn(db, 'sales', 'customer_name', 'TEXT');
      await ensureColumn(db, 'sales', 'allow_over_limit', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumn(db, 'expenses', 'idempotency_key', 'TEXT');
      await ensureColumn(db, 'expenses', 'remote_id', 'TEXT');
      await ensureColumn(db, 'payments', 'remote_id', 'TEXT');
      await ensureColumn(db, 'customer_ledger', 'remote_id', 'TEXT');
      await ensureColumn(db, 'stock_movements', 'remote_id', 'TEXT');
      await ensureColumn(db, 'sync_queue', 'error', 'TEXT');
      await seedIfEmpty(db);
      return db;
    })();
  }

  return dbPromise;
}

export async function getAppMode() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM app_settings WHERE key = 'mode'");
  return row?.value === 'offline' ? 'offline' : 'online';
}

export async function setAppMode(mode) {
  if (mode !== 'online' && mode !== 'offline') throw new Error('Invalid app mode.');
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES ('mode', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [mode]
  );
}

export async function hasOfflineSnapshot() {
  const db = await getDb();
  return Boolean(await db.getFirstAsync("SELECT last_synced_at FROM sync_meta WHERE entity = 'snapshot'"));
}

async function ensureColumn(db, table, column, type) {
  const columns = await db.getAllAsync(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Starter data so the app is usable on first launch. Replace with the real
// menu and prices from Manu's Resto during discovery / pilot.
async function seedIfEmpty(db) {
  const u = await db.getFirstAsync('SELECT COUNT(*) AS c FROM users');
  if (u.c === 0) {
    await db.runAsync(
      'INSERT INTO users (id, business_id, name, role, created_at) VALUES (?,?,?,?,?)',
      [OWNER_ID, BUSINESS_ID, 'Owner', 'owner', Date.now()]
    );
  }
}
