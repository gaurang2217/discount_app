import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  // Fetch all data in parallel — individual table queries bypass the RPC row cap
  const [grnRes, srRes, mrRes, receiptsRes] = await Promise.all([
    supabase.from('grn_items')
      .select('manufacture_name, grn_date, item_id, rec_qty, unit_rate')
      .neq('manufacture_name', '')
      .not('grn_date', 'is', null)
      .limit(100000),
    supabase.from('sponsorship_rates')
      .select('manufacture_name, item_id, rate_pct, effective_from')
      .limit(50000),
    supabase.from('manufacturer_rates')
      .select('manufacture_name, rate_pct, effective_from')
      .limit(10000),
    supabase.from('sponsorship_receipts')
      .select('manufacture_name, month, amount_received, received_date, notes')
      .limit(50000),
  ]);

  if (grnRes.error) return NextResponse.json({ error: grnRes.error.message }, { status: 500 });
  if (srRes.error) return NextResponse.json({ error: srRes.error.message }, { status: 500 });
  if (mrRes.error) return NextResponse.json({ error: mrRes.error.message }, { status: 500 });
  if (receiptsRes.error) return NextResponse.json({ error: receiptsRes.error.message }, { status: 500 });

  const grnItems = grnRes.data ?? [];
  const srMap = new Map<string, { rate_pct: number; effective_from: string | null }>();
  for (const r of srRes.data ?? []) {
    srMap.set(`${r.manufacture_name}||${r.item_id}`, { rate_pct: r.rate_pct, effective_from: r.effective_from });
  }
  const mrMap = new Map<string, { rate_pct: number; effective_from: string | null }>();
  for (const r of mrRes.data ?? []) {
    mrMap.set(r.manufacture_name, { rate_pct: r.rate_pct, effective_from: r.effective_from });
  }
  const receiptsMap = new Map<string, { amount_received: number | null; received_date: string | null; notes: string | null }>();
  for (const r of receiptsRes.data ?? []) {
    receiptsMap.set(`${r.manufacture_name}||${r.month}`, {
      amount_received: r.amount_received,
      received_date: r.received_date,
      notes: r.notes,
    });
  }

  // Aggregate by (manufacture_name, month, item_id)
  type ItemKey = string;
  const itemAgg = new Map<ItemKey, { manufacture_name: string; month: string; item_id: string; purchase_value: number }>();

  for (const g of grnItems) {
    if (!g.grn_date || !/^\d{4}-\d{2}-\d{2}/.test(g.grn_date)) continue;
    const month = g.grn_date.substring(0, 7); // YYYY-MM
    const key = `${g.manufacture_name}||${month}||${g.item_id}`;
    const existing = itemAgg.get(key);
    const pv = (g.rec_qty ?? 0) * (g.unit_rate ?? 0);
    if (existing) {
      existing.purchase_value += pv;
    } else {
      itemAgg.set(key, { manufacture_name: g.manufacture_name, month, item_id: g.item_id, purchase_value: pv });
    }
  }

  // Aggregate by (manufacture_name, month)
  const monthAgg = new Map<string, { manufacture_name: string; month: string; purchase_value: number; sponsorship_due: number }>();

  for (const item of itemAgg.values()) {
    const sr = srMap.get(`${item.manufacture_name}||${item.item_id}`);
    const mr = mrMap.get(item.manufacture_name);

    let rate = 0;
    if (sr) {
      rate = (!sr.effective_from || item.month >= sr.effective_from) ? sr.rate_pct : 0;
    } else if (mr) {
      rate = (!mr.effective_from || item.month >= mr.effective_from) ? mr.rate_pct : 0;
    }

    const key = `${item.manufacture_name}||${item.month}`;
    const existing = monthAgg.get(key);
    if (existing) {
      existing.purchase_value += item.purchase_value;
      existing.sponsorship_due += item.purchase_value * rate / 100;
    } else {
      monthAgg.set(key, {
        manufacture_name: item.manufacture_name,
        month: item.month,
        purchase_value: item.purchase_value,
        sponsorship_due: item.purchase_value * rate / 100,
      });
    }
  }

  const result = [...monthAgg.values()].map(row => {
    const receipt = receiptsMap.get(`${row.manufacture_name}||${row.month}`);
    return {
      manufacture_name: row.manufacture_name,
      month: row.month,
      purchase_value: row.purchase_value,
      sponsorship_due: row.sponsorship_due,
      amount_received: receipt?.amount_received ?? null,
      received_date: receipt?.received_date ?? null,
      notes: receipt?.notes ?? null,
    };
  }).sort((a, b) => b.month.localeCompare(a.month) || a.manufacture_name.localeCompare(b.manufacture_name));

  return NextResponse.json(result);
}
