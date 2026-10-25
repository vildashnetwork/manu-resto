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
      await seedIfEmpty(db);
      return db;
    })();
  }
  return dbPromise;
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
  const p = await db.getFirstAsync('SELECT COUNT(*) AS c FROM products');
  if (p.c > 0) return;
  const samples = [
    ['Riz sauce tomate', 'Meals', 'plate', 1500, 800, 0, false],
    ['Poulet DG', 'Meals', 'plate', 3500, 2000, 0, false],
    ['Poisson braisé', 'Meals', 'portion', 3000, 1800, 0, false],
    ['Bière 65cl', 'Drinks', 'bottle', 700, 500, 24, true],
    ['Coca-Cola 50cl', 'Drinks', 'bottle', 500, 350, 24, true],
    ['Eau minérale 1.5L', 'Drinks', 'bottle', 500, 300, 12, true],
    ['Beignets', 'Snacks', 'pack', 200, 100, 0, false],
  ];
  const ts = Date.now();
  for (const [name, category, unit, price, cost, threshold, tracked] of samples) {
    await db.runAsync(
      `INSERT INTO products (id, business_id, name, category, unit, price, cost, low_stock_threshold, tracked, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uid(), BUSINESS_ID, name, category, unit, price, cost, threshold > 0 ? Math.round(threshold / 2) : 0, tracked ? 1 : 0, ts]
    );
  }
}
