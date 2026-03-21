import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { loadMappings, applyManufacturerMappingSync } from '@/lib/applyMappings';
import { randomUUID } from 'crypto';

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return '';
  }
  // JS Date object
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return s;
}

function colIdx(headers: string[], name: string): number {
  return headers.findIndex(h => h && h.trim().toUpperCase() === name.toUpperCase());
}

interface AggRow {
  grn_no: string; item_id: string; grn_date: string; item_name: string;
  item_category: string; item_sub_category: string; batch_no: string; expiry_date: string;
  rec_qty: number; free_qty: number; total_purchase: number; mrp: number;
  manufacture_name: string; supplier_name: string; department_name: string;
}

async function fetchExistingInBatches(grnNos: string[]): Promise<Map<string, { manufacture_name: string }>> {
  const map = new Map<string, { manufacture_name: string }>();
  const CHUNK = 200;
  for (let i = 0; i < grnNos.length; i += CHUNK) {
    const chunk = grnNos.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('grn_items')
      .select('grn_no, item_id, manufacture_name')
      .in('grn_no', chunk)
      .limit(50000);
    if (error) throw new Error(`Failed to fetch existing items: ${error.message}`);
    for (const item of data ?? []) {
      map.set(`${item.grn_no}||${item.item_id}`, { manufacture_name: item.manufacture_name });
    }
  }
  return map;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

    if (rawRows.length < 2) return NextResponse.json({ error: 'File is empty' }, { status: 400 });

    const headers = (rawRows[0] as unknown[]).map(h => toStr(h));

    const COL = {
      grn_no:           colIdx(headers, 'GRN NO'),
      grn_date:         colIdx(headers, 'TXN DATE'),
      item_id:          colIdx(headers, 'ITEM CODE'),
      item_name:        colIdx(headers, 'AKHIL NAME'),
      batch_no:         colIdx(headers, 'BATCH'),
      expiry_date:      colIdx(headers, 'EXPIRY'),
      pack_qty:         colIdx(headers, 'PACK_QTY'),
      loose_qty:        colIdx(headers, 'LOOSE_QTY'),
      pack_pur:         colIdx(headers, 'PACK_PUR'),
      pack_mrp:         colIdx(headers, 'PACK_MRP'),
      manufacture_name: colIdx(headers, 'MANUFACTURER'),
      supplier_name:    colIdx(headers, 'VENDOR'),
      item_category:    colIdx(headers, 'CATEGORY'),
      item_sub_category: colIdx(headers, 'SUB CATEGORY'),
      store_name:       colIdx(headers, 'STORE NAME'),
    };

    for (const [name, idx] of Object.entries(COL)) {
      if (idx === -1) return NextResponse.json({ error: `Column not found: ${name}` }, { status: 400 });
    }

    const mappingMap = await loadMappings();
    const batchId = randomUUID();
    const overwrite = formData.get('overwrite') === 'true';

    let parsed = 0;
    const aggMap = new Map<string, AggRow>();

    for (const row of rawRows.slice(1)) {
      const grn_no = toStr(row[COL.grn_no]);
      const item_id = toStr(row[COL.item_id]);
      if (!grn_no || !item_id) continue;
      parsed++;

      const pack_qty = toNum(row[COL.pack_qty]);
      const pack_pur = toNum(row[COL.pack_pur]);
      const loose_qty = toNum(row[COL.loose_qty]);
      const isFree = pack_pur === 0;

      const key = `${grn_no}||${item_id}`;
      const existing = aggMap.get(key);
      if (existing) {
        if (isFree) {
          existing.free_qty += loose_qty;
        } else {
          existing.rec_qty += loose_qty;
          existing.total_purchase += pack_qty * pack_pur;
        }
      } else {
        aggMap.set(key, {
          grn_no,
          item_id,
          grn_date: parseDate(row[COL.grn_date]),
          item_name: toStr(row[COL.item_name]),
          item_category: toStr(row[COL.item_category]),
          item_sub_category: toStr(row[COL.item_sub_category]),
          batch_no: toStr(row[COL.batch_no]),
          expiry_date: toStr(row[COL.expiry_date]),
          rec_qty: isFree ? 0 : loose_qty,
          free_qty: isFree ? loose_qty : 0,
          total_purchase: isFree ? 0 : pack_qty * pack_pur,
          mrp: toNum(row[COL.pack_mrp]),
          manufacture_name: applyManufacturerMappingSync(mappingMap, toStr(row[COL.manufacture_name])),
          supplier_name: toStr(row[COL.supplier_name]),
          department_name: toStr(row[COL.store_name]),
        });
      }
    }

    const aggRows = [...aggMap.values()];
    const toInsert = aggRows.map(agg => ({
      grn_no: agg.grn_no,
      item_id: agg.item_id,
      grn_date: agg.grn_date,
      item_name: agg.item_name,
      item_category: agg.item_category,
      item_sub_category: agg.item_sub_category,
      batch_no: agg.batch_no,
      expiry_date: agg.expiry_date,
      unit_name: 'PACK',
      rec_qty: agg.rec_qty,
      free_qty: agg.free_qty,
      unit_rate: agg.rec_qty > 0 ? agg.total_purchase / agg.rec_qty : 0,
      mrp: agg.mrp,
      manufacture_name: agg.manufacture_name,
      supplier_name: agg.supplier_name,
      department_name: agg.department_name,
      upload_batch: batchId,
    }));

    let inserted = 0;
    let skipped = 0;
    let already_exists = 0;
    let discrepancyCount = 0;

    if (overwrite) {
      // Overwrite mode: upsert everything, update existing rows
      const BATCH = 500;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const { error: upsertError } = await supabase
          .from('grn_items')
          .upsert(chunk, { onConflict: 'grn_no,item_id' });
        if (upsertError) throw new Error(`Insert failed: ${upsertError.message}`);
      }
      inserted = toInsert.length;
    } else {
      // Non-overwrite: check existing to detect discrepancies, skip duplicates
      const grnNos = [...new Set(aggRows.map(r => r.grn_no))];
      const existingMap = await fetchExistingInBatches(grnNos);

      const toInsertNew: object[] = [];
      const discrepancies: object[] = [];

      for (const row of toInsert) {
        const key = `${row.grn_no}||${row.item_id}`;
        const existing = existingMap.get(key);
        if (existing) {
          if (existing.manufacture_name && existing.manufacture_name !== row.manufacture_name) {
            discrepancies.push({
              upload_batch: batchId,
              item_id: row.item_id,
              item_name: row.item_name,
              grn_no: row.grn_no,
              grn_date: row.grn_date,
              uploaded_manufacture_name: row.manufacture_name,
              existing_manufacture_name: existing.manufacture_name,
              status: 'pending',
            });
            discrepancyCount++;
          } else {
            already_exists++;
          }
          continue;
        }
        toInsertNew.push(row);
      }

      if (toInsertNew.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < toInsertNew.length; i += BATCH) {
          const chunk = toInsertNew.slice(i, i + BATCH);
          const { data: insertData, error: insertError } = await supabase
            .from('grn_items')
            .upsert(chunk, { onConflict: 'grn_no,item_id', ignoreDuplicates: true })
            .select('id');
          if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
          inserted += insertData?.length ?? 0;
        }
        skipped = toInsertNew.length - inserted;
      }

      if (discrepancies.length > 0) {
        const { error: discError } = await supabase
          .from('upload_discrepancies')
          .insert(discrepancies);
        if (discError) throw new Error(`Discrepancy insert failed: ${discError.message}`);
      }
    }

    const { error: logError } = await supabase
      .from('upload_log')
      .insert({
        batch_id: batchId,
        filename: file.name,
        total_rows: parsed,
        inserted,
        skipped_duplicates: skipped,
        partial_duplicates: already_exists,
      });
    if (logError) console.error('Upload log insert failed:', logError.message);

    return NextResponse.json({
      success: true,
      total: parsed,
      inserted,
      skipped_duplicates: skipped,
      already_exists,
      discrepancies: discrepancyCount,
      free_qty_rows: aggRows.filter(r => r.free_qty > 0).length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
