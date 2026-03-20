-- Supabase schema for Rungta Hospital Sponsorship App
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS grn_items (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT DEFAULT now()::TEXT,
  UNIQUE(grn_no, item_id)
);

CREATE INDEX IF NOT EXISTS idx_grn_items_manufacture ON grn_items(manufacture_name);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn_date ON grn_items(grn_date);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn_no ON grn_items(grn_no);

CREATE TABLE IF NOT EXISTS sponsorship_rates (
  id SERIAL PRIMARY KEY,
  manufacture_name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT,
  rate_pct REAL DEFAULT 0,
  effective_from TEXT,
  created_at TEXT DEFAULT now()::TEXT,
  updated_at TEXT DEFAULT now()::TEXT,
  UNIQUE(manufacture_name, item_id)
);

CREATE TABLE IF NOT EXISTS sponsorship_receipts (
  id SERIAL PRIMARY KEY,
  manufacture_name TEXT NOT NULL,
  month TEXT NOT NULL,
  amount_due REAL DEFAULT 0,
  amount_received REAL,
  received_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT now()::TEXT,
  updated_at TEXT DEFAULT now()::TEXT,
  UNIQUE(manufacture_name, month)
);

CREATE TABLE IF NOT EXISTS manufacturer_mappings (
  from_name TEXT PRIMARY KEY,
  to_name TEXT NOT NULL,
  updated_at TEXT DEFAULT now()::TEXT
);

CREATE TABLE IF NOT EXISTS item_name_mappings (
  from_name TEXT PRIMARY KEY,
  to_name TEXT NOT NULL,
  updated_at TEXT DEFAULT now()::TEXT
);

CREATE TABLE IF NOT EXISTS upload_discrepancies (
  id SERIAL PRIMARY KEY,
  upload_batch TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT,
  grn_no TEXT,
  grn_date TEXT,
  uploaded_manufacture_name TEXT,
  existing_manufacture_name TEXT,
  status TEXT DEFAULT 'pending',
  resolved_to TEXT,
  created_at TEXT DEFAULT now()::TEXT
);

CREATE TABLE IF NOT EXISTS manufacturer_rates (
  id SERIAL PRIMARY KEY,
  manufacture_name TEXT NOT NULL UNIQUE,
  rate_pct REAL DEFAULT 0,
  effective_from TEXT,
  created_at TEXT DEFAULT now()::TEXT,
  updated_at TEXT DEFAULT now()::TEXT
);

CREATE TABLE IF NOT EXISTS upload_log (
  id SERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL,
  filename TEXT,
  total_rows INTEGER,
  inserted INTEGER,
  skipped_duplicates INTEGER,
  partial_duplicates INTEGER,
  uploaded_at TEXT DEFAULT now()::TEXT
);

-- =====================================================================
-- PostgreSQL functions used via supabase.rpc()
-- =====================================================================

-- get_dashboard_data()
-- Returns per-manufacturer, per-month aggregated purchase + sponsorship data
-- joined with receipts.
CREATE OR REPLACE FUNCTION get_dashboard_data()
RETURNS TABLE (
  manufacture_name TEXT,
  month TEXT,
  purchase_value NUMERIC,
  sponsorship_due NUMERIC,
  amount_received NUMERIC,
  received_date TEXT,
  notes TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH item_monthly AS (
    SELECT
      g.manufacture_name,
      to_char(g.grn_date::date, 'YYYY-MM') AS month,
      g.item_id,
      SUM(g.rec_qty * g.unit_rate) AS purchase_value,
      CASE
        WHEN sr.rate_pct IS NOT NULL THEN
          CASE
            WHEN sr.effective_from IS NULL
              OR to_char(g.grn_date::date, 'YYYY-MM') >= sr.effective_from
            THEN sr.rate_pct
            ELSE 0
          END
        WHEN mr.rate_pct IS NOT NULL THEN
          CASE
            WHEN mr.effective_from IS NULL
              OR to_char(g.grn_date::date, 'YYYY-MM') >= mr.effective_from
            THEN mr.rate_pct
            ELSE 0
          END
        ELSE 0
      END AS rate_pct
    FROM grn_items g
    LEFT JOIN sponsorship_rates sr
      ON sr.manufacture_name = g.manufacture_name AND sr.item_id = g.item_id
    LEFT JOIN manufacturer_rates mr
      ON mr.manufacture_name = g.manufacture_name
    WHERE g.manufacture_name != '' AND g.grn_date != '' AND g.grn_date IS NOT NULL
    GROUP BY g.manufacture_name, month, g.item_id, sr.rate_pct, sr.effective_from, mr.rate_pct, mr.effective_from
  ),
  aggregated AS (
    SELECT
      manufacture_name,
      month,
      SUM(purchase_value) AS purchase_value,
      SUM(purchase_value * rate_pct / 100) AS sponsorship_due
    FROM item_monthly
    GROUP BY manufacture_name, month
  )
  SELECT
    a.manufacture_name,
    a.month,
    a.purchase_value,
    a.sponsorship_due,
    r.amount_received,
    r.received_date,
    r.notes
  FROM aggregated a
  LEFT JOIN sponsorship_receipts r
    ON r.manufacture_name = a.manufacture_name AND r.month = a.month
  ORDER BY a.month DESC, a.manufacture_name;
$$;

-- get_manufacturers_summary()
-- Returns per-manufacturer aggregate stats
CREATE OR REPLACE FUNCTION get_manufacturers_summary()
RETURNS TABLE (
  manufacture_name TEXT,
  grn_count BIGINT,
  item_lines BIGINT,
  total_purchase_value NUMERIC,
  first_date TEXT,
  last_date TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    manufacture_name,
    COUNT(DISTINCT grn_no) AS grn_count,
    COUNT(*) AS item_lines,
    SUM(rec_qty * unit_rate) AS total_purchase_value,
    MIN(grn_date) AS first_date,
    MAX(grn_date) AS last_date
  FROM grn_items
  WHERE manufacture_name != ''
  GROUP BY manufacture_name
  ORDER BY manufacture_name;
$$;

-- get_manufacturer_monthly(p_mfr TEXT)
-- Returns item-level monthly breakdown for a single manufacturer
CREATE OR REPLACE FUNCTION get_manufacturer_monthly(p_mfr TEXT)
RETURNS TABLE (
  month TEXT,
  item_id TEXT,
  item_name TEXT,
  item_category TEXT,
  item_sub_category TEXT,
  total_rec_qty NUMERIC,
  total_free_qty NUMERIC,
  avg_rate NUMERIC,
  purchase_value NUMERIC,
  grn_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    to_char(grn_date::date, 'YYYY-MM') AS month,
    item_id,
    item_name,
    item_category,
    item_sub_category,
    SUM(rec_qty) AS total_rec_qty,
    SUM(free_qty) AS total_free_qty,
    AVG(unit_rate) AS avg_rate,
    SUM(rec_qty * unit_rate) AS purchase_value,
    COUNT(DISTINCT grn_no) AS grn_count
  FROM grn_items
  WHERE manufacture_name = p_mfr
  GROUP BY month, item_id, item_name, item_category, item_sub_category
  ORDER BY month DESC, item_name;
$$;

-- Grant permissions to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
