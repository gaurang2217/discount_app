import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'sponsorship.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grn_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_no TEXT NOT NULL,
      item_id TEXT NOT NULL,
      grn_date TEXT,
      item_name TEXT,
      item_category TEXT,
      item_sub_category TEXT,
      generic_name TEXT,
      department_name TEXT,
      challan_no TEXT,
      po_no TEXT,
      gir_no TEXT,
      bill_no TEXT,
      supplier_name TEXT,
      sup_gstin TEXT,
      batch_no TEXT,
      expiry_date TEXT,
      unit_name TEXT,
      rec_qty REAL DEFAULT 0,
      free_qty REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      unit_rate REAL DEFAULT 0,
      disc_pct REAL DEFAULT 0,
      sgst_pct REAL DEFAULT 0,
      cgst_pct REAL DEFAULT 0,
      mrp REAL DEFAULT 0,
      manufacture_name TEXT,
      status TEXT,
      employee_name TEXT,
      upload_batch TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(grn_no, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_grn_items_manufacture ON grn_items(manufacture_name);
    CREATE INDEX IF NOT EXISTS idx_grn_items_grn_date ON grn_items(grn_date);
    CREATE INDEX IF NOT EXISTS idx_grn_items_grn_no ON grn_items(grn_no);

    CREATE TABLE IF NOT EXISTS sponsorship_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacture_name TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT,
      rate_pct REAL DEFAULT 0,
      effective_from TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(manufacture_name, item_id)
    );

    CREATE TABLE IF NOT EXISTS sponsorship_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacture_name TEXT NOT NULL,
      month TEXT NOT NULL,
      amount_due REAL DEFAULT 0,
      amount_received REAL,
      received_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(manufacture_name, month)
    );

    CREATE TABLE IF NOT EXISTS manufacturer_mappings (
      from_name TEXT PRIMARY KEY,
      to_name TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS item_name_mappings (
      from_name TEXT PRIMARY KEY,
      to_name TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upload_discrepancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_batch TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT,
      grn_no TEXT,
      grn_date TEXT,
      uploaded_manufacture_name TEXT,
      existing_manufacture_name TEXT,
      status TEXT DEFAULT 'pending',
      resolved_to TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS manufacturer_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacture_name TEXT NOT NULL UNIQUE,
      rate_pct REAL DEFAULT 0,
      effective_from TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upload_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      filename TEXT,
      total_rows INTEGER,
      inserted INTEGER,
      skipped_duplicates INTEGER,
      partial_duplicates INTEGER,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add effective_from to existing sponsorship_rates tables
  const cols = db.prepare(`PRAGMA table_info(sponsorship_rates)`).all() as { name: string }[];
  if (!cols.find(c => c.name === 'effective_from')) {
    db.exec(`ALTER TABLE sponsorship_rates ADD COLUMN effective_from TEXT`);
  }
}
