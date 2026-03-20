import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';

  // Fetch grn_items with search filter
  const { data: grnData, error: grnError } = await supabase
    .from('grn_items')
    .select('item_id, item_name, item_category, item_sub_category, manufacture_name, grn_no, rec_qty, unit_rate, grn_date')
    .or(`item_name.ilike.%${q}%,item_id.ilike.%${q}%,manufacture_name.ilike.%${q}%`);

  if (grnError) return NextResponse.json({ error: grnError.message }, { status: 500 });

  // Fetch all relevant sponsorship rates
  const { data: ratesData } = await supabase
    .from('sponsorship_rates')
    .select('manufacture_name, item_id, rate_pct');

  const rateMap = new Map<string, number>();
  for (const r of ratesData ?? []) {
    rateMap.set(`${r.manufacture_name}||${r.item_id}`, r.rate_pct);
  }

  // Aggregate in JS
  const map = new Map<string, {
    item_id: string;
    item_name: string;
    item_category: string;
    item_sub_category: string;
    manufacture_name: string;
    grn_nos: Set<string>;
    total_rec_qty: number;
    total_purchase_value: number;
    first_date: string;
    last_date: string;
  }>();

  for (const row of grnData ?? []) {
    const key = `${row.item_id}||${row.manufacture_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.grn_nos.add(row.grn_no);
      existing.total_rec_qty += row.rec_qty ?? 0;
      existing.total_purchase_value += (row.rec_qty ?? 0) * (row.unit_rate ?? 0);
      if (row.grn_date && (!existing.first_date || row.grn_date < existing.first_date)) existing.first_date = row.grn_date;
      if (row.grn_date && (!existing.last_date || row.grn_date > existing.last_date)) existing.last_date = row.grn_date;
    } else {
      map.set(key, {
        item_id: row.item_id,
        item_name: row.item_name ?? '',
        item_category: row.item_category ?? '',
        item_sub_category: row.item_sub_category ?? '',
        manufacture_name: row.manufacture_name ?? '',
        grn_nos: new Set([row.grn_no]),
        total_rec_qty: row.rec_qty ?? 0,
        total_purchase_value: (row.rec_qty ?? 0) * (row.unit_rate ?? 0),
        first_date: row.grn_date ?? '',
        last_date: row.grn_date ?? '',
      });
    }
  }

  const result = [...map.values()].map(m => ({
    item_id: m.item_id,
    item_name: m.item_name,
    item_category: m.item_category,
    item_sub_category: m.item_sub_category,
    manufacture_name: m.manufacture_name,
    grn_count: m.grn_nos.size,
    total_rec_qty: m.total_rec_qty,
    total_purchase_value: m.total_purchase_value,
    first_date: m.first_date,
    last_date: m.last_date,
    sponsorship_pct: rateMap.get(`${m.manufacture_name}||${m.item_id}`) ?? 0,
  })).sort((a, b) => {
    const n = a.item_name.localeCompare(b.item_name);
    return n !== 0 ? n : a.manufacture_name.localeCompare(b.manufacture_name);
  });

  return NextResponse.json(result);
}
