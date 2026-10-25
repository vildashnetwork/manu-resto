// Local (device) schema. Mirrors the central PostgreSQL design in the proposal.
// All money columns are INTEGER FCFA. Timestamps are epoch milliseconds.
// customer_ledger.amount is signed: + increases debt, - reduces debt.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','cashier')), pin TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, code TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0, notes TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, remote_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit', price INTEGER NOT NULL, cost INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 0, tracked INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
  barcode TEXT, image_url TEXT, remote_image_url TEXT, remote_id TEXT UNIQUE,
  base_stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, receipt_no TEXT NOT NULL,
  cashier_id TEXT NOT NULL, customer_id TEXT, customer_name TEXT,
  total INTEGER NOT NULL, paid_amount INTEGER NOT NULL, credit_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
  cancel_reason TEXT, idempotency_key TEXT NOT NULL UNIQUE,
  sync_status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, remote_id TEXT UNIQUE,
  allow_over_limit INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL,
  product_name TEXT NOT NULL, unit_price INTEGER NOT NULL, unit_cost INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL, line_total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sale','repayment')),
  sale_id TEXT, customer_id TEXT, method TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0),
  reference TEXT, status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','reversed')),
  idempotency_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, remote_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS customer_ledger (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('opening','credit_sale','payment','reversal')),
  amount INTEGER NOT NULL, ref_type TEXT, ref_id TEXT, note TEXT, created_at INTEGER NOT NULL, remote_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL, qty INTEGER NOT NULL, note TEXT, ref_id TEXT, created_at INTEGER NOT NULL, remote_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), method TEXT NOT NULL, note TEXT,
  created_by TEXT, created_at INTEGER NOT NULL, idempotency_key TEXT UNIQUE, remote_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, opened_by TEXT NOT NULL,
  opening_cash INTEGER NOT NULL DEFAULT 0, expected_cash INTEGER, counted_cash INTEGER,
  difference INTEGER, opened_at INTEGER NOT NULL, closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT, reason TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, op TEXT NOT NULL,
  payload TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, error TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_meta (
  entity TEXT PRIMARY KEY, last_synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id);
`;
