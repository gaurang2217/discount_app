import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { loadMappings, applyManufacturerMappingSync } from '@/lib/applyMappings';
import { randomUUID } from 'crypto';

interface GrnRow {
  grn_no: string;
  item_id: string;
  grn_date: string;
  item_name: string;
  item_category: string;
  item_sub_category: string;
  generic_name: string;
  department_name: string;
  challan_no: string;
  po_no: string;
  gir_no: string;
  bill_no: string;
  supplier_name: string;
  sup_gstin: string;
  batch_no: string;
  expiry_date: string;
  unit_name: string;
  rec_qty: number;
  free_qty: number;
  rate: number;
  unit_rate: number;
  disc_pct: number;
  sgst_pct: number;
  cgst_pct: number;
  mrp: number;
  manufacture_name: string;
  status: string;
  employee_name: string;
}

function parseDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  if (typeof val === 'string') {
    // Try DD/MM/YYYY
    const match = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val);
}

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseRows(rawRows: unknown[][], mappingMap: Map<string, string>): GrnRow[] {
  // Find header row (the one containing 'Grn No')
  let headerIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row && row.includes('Grn No')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Could not find header row with "Grn No" column');

  const headers = rawRows[headerIdx] as string[];
  const getCol = (name: string) => headers.indexOf(name);

  const COL = {
    item_id: getCol('Item Id'),
    item_category: getCol('Item Category Name'),
    item_sub_category: getCol('Item Sub Category Name'),
    item_name: getCol('Item Name'),
    generic_name: getCol('Generic Name'),
    dept: getCol('Department Name'),
    grn_no: getCol('Grn No'),
    grn_date: getCol('Grn Date'),
    challan_no: getCol('Challan No./ Date : '),
    po_no: getCol('PO No. / Date : '),
    gir_no: getCol('GIR No.'),
    bill_no: getCol('Bill No. / Date'),
    supplier_name: getCol('Supplier Name'),
    sup_gstin: getCol('Sup GSTIN'),
    batch_no: getCol('Batch No'),
    expiry_date: getCol('Expiry Date'),
    unit_name: getCol('Unit Name'),
    rec_qty: getCol('Rec. Qty.'),
    free_qty: getCol('Free Qty.'),
    rate: getCol('Rate'),
    unit_rate: getCol('Unit Rate'),
    disc_pct: getCol('Disc. %'),
    sgst_pct: getCol('SGST%'),
    cgst_pct: getCol('CGST%'),
    mrp: getCol('MRP'),
    manufacture_name: getCol('Manufacture Name'),
    status: getCol('Status'),
    employee_name: getCol('Employee Name'),
  };

  const results: GrnRow[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;
    const grn_no = toStr(row[COL.grn_no]);
    const item_id = toStr(row[COL.item_id]);
    if (!grn_no || !item_id) continue;

    results.push({
      grn_no,
      item_id,
      grn_date: parseDate(row[COL.grn_date]),
      item_name: toStr(row[COL.item_name]),
      item_category: toStr(row[COL.item_category]),
      item_sub_category: toStr(row[COL.item_sub_category]),
      generic_name: toStr(row[COL.generic_name]),
      department_name: toStr(row[COL.dept]),
      challan_no: toStr(row[COL.challan_no]),
      po_no: toStr(row[COL.po_no]),
      gir_no: toStr(row[COL.gir_no]),
      bill_no: toStr(row[COL.bill_no]),
      supplier_name: toStr(row[COL.supplier_name]),
      sup_gstin: toStr(row[COL.sup_gstin]),
      batch_no: toStr(row[COL.batch_no]),
      expiry_date: parseDate(row[COL.expiry_date]),
      unit_name: toStr(row[COL.unit_name]),
      rec_qty: toNum(row[COL.rec_qty]),
      free_qty: toNum(row[COL.free_qty]),
      rate: toNum(row[COL.rate]),
      unit_rate: toNum(row[COL.unit_rate]),
      disc_pct: toNum(row[COL.disc_pct]),
      sgst_pct: toNum(row[COL.sgst_pct]),
      cgst_pct: toNum(row[COL.cgst_pct]),
      mrp: toNum(row[COL.mrp]),
      manufacture_name: applyManufacturerMappingSync(mappingMap, toStr(row[COL.manufacture_name])),
      status: toStr(row[COL.status]),
      employee_name: toStr(row[COL.employee_name]),
    });
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

    // Pre-load mappings once
    const mappingMap = await loadMappings();

    const rows = parseRows(rawRows, mappingMap);
    if (rows.length === 0) return NextResponse.json({ error: 'No data rows found' }, { status: 400 });

    const batchId = randomUUID();

    // Fetch all existing items for conflict/discrepancy detection
    const grnNos = [...new Set(rows.map(r => r.grn_no))];
    const existingMap = new Map<string, { manufacture_name: string }>();
    const GRN_CHUNK = 200;
    const chunkPromises = [];
    for (let i = 0; i < grnNos.length; i += GRN_CHUNK) {
      const chunk = grnNos.slice(i, i + GRN_CHUNK);
      chunkPromises.push(
        supabase.from('grn_items').select('grn_no, item_id, manufacture_name').in('grn_no', chunk).limit(50000)
      );
    }
    const chunkResults = await Promise.all(chunkPromises);
    for (const { data: existingItems, error: fetchError } of chunkResults) {
      if (fetchError) throw new Error(`Failed to fetch existing items: ${fetchError.message}`);
      for (const item of existingItems ?? []) {
        existingMap.set(`${item.grn_no}||${item.item_id}`, { manufacture_name: item.manufacture_name });
      }
    }

    const toInsert: (GrnRow & { upload_batch: string })[] = [];
    const discrepancies: {
      upload_batch: string;
      item_id: string;
      item_name: string;
      grn_no: string;
      grn_date: string;
      uploaded_manufacture_name: string;
      existing_manufacture_name: string;
      status: string;
    }[] = [];

    let skipped = 0;
    let partial = 0;
    let discrepancyCount = 0;

    for (const row of rows) {
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
          partial++;
        }
        continue;
      }
      toInsert.push({ ...row, upload_batch: batchId });
    }

    let inserted = 0;

    if (toInsert.length > 0) {
      const BATCH = 500;
      const insertPromises = [];
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        insertPromises.push(
          supabase.from('grn_items').upsert(chunk, { onConflict: 'grn_no,item_id', ignoreDuplicates: true }).select('id')
        );
      }
      const insertResults = await Promise.all(insertPromises);
      for (const { data: insertData, error: insertError } of insertResults) {
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
        inserted += insertData?.length ?? 0;
      }
      skipped = toInsert.length - inserted;
    }

    if (discrepancies.length > 0) {
      const { error: discError } = await supabase
        .from('upload_discrepancies')
        .insert(discrepancies);
      if (discError) throw new Error(`Discrepancy insert failed: ${discError.message}`);
    }

    const { error: logError } = await supabase
      .from('upload_log')
      .insert({
        batch_id: batchId,
        filename: file.name,
        total_rows: rows.length,
        inserted,
        skipped_duplicates: skipped,
        partial_duplicates: partial,
      });
    if (logError) console.error('Upload log insert failed:', logError.message);

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted,
      skipped_duplicates: skipped,
      already_exists: partial,
      discrepancies: discrepancyCount,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
