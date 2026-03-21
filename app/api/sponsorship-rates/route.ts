import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mfr = searchParams.get('manufacture_name');

  let query = supabase.from('sponsorship_rates').select('*');
  if (mfr) {
    query = query.eq('manufacture_name', mfr).order('item_name');
  } else {
    query = query.order('manufacture_name').order('item_name');
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { manufacture_name, item_id, item_name, rate_pct, effective_from } = body;

  if (!manufacture_name || !item_id) {
    return NextResponse.json({ error: 'manufacture_name and item_id are required' }, { status: 400 });
  }

  // Find all item_ids with the same item_name under this manufacturer
  // (legacy and new system may use different item_ids for the same physical product)
  const { data: sameNameItems, error: lookupError } = await supabase
    .from('grn_items')
    .select('item_id')
    .eq('manufacture_name', manufacture_name)
    .eq('item_name', item_name || '');
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const allItemIds = new Set([item_id, ...(sameNameItems ?? []).map((r: { item_id: string }) => r.item_id)]);

  const newRate = Number(rate_pct) || 0;

  // Fetch existing rates for audit log
  const { data: existingRates } = await supabase
    .from('sponsorship_rates')
    .select('item_id, rate_pct, effective_from')
    .eq('manufacture_name', manufacture_name)
    .in('item_id', [...allItemIds]);
  const existingMap = new Map((existingRates ?? []).map(r => [r.item_id, r]));

  const upsertRows = [...allItemIds].map(id => ({
    manufacture_name,
    item_id: id,
    item_name: item_name || '',
    rate_pct: newRate,
    effective_from: effective_from || null,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from('sponsorship_rates')
    .upsert(upsertRows, { onConflict: 'manufacture_name,item_id' });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Log changes
  const logRows = [...allItemIds].map(id => {
    const old = existingMap.get(id);
    if (old && old.rate_pct === newRate && old.effective_from === (effective_from || null)) return null;
    return {
      change_type: 'item_rate',
      manufacture_name,
      item_id: id,
      item_name: item_name || '',
      old_rate_pct: old?.rate_pct ?? null,
      new_rate_pct: newRate,
      old_effective_from: old?.effective_from ?? null,
      new_effective_from: effective_from || null,
      changed_at: new Date().toISOString(),
    };
  }).filter(Boolean);

  if (logRows.length > 0) {
    await supabase.from('rate_change_log').insert(logRows);
  }

  return NextResponse.json({ success: true, applied_to: allItemIds.size });
}

export async function DELETE(req: NextRequest) {
  const { manufacture_name, item_id } = await req.json();

  const { error } = await supabase
    .from('sponsorship_rates')
    .delete()
    .eq('manufacture_name', manufacture_name)
    .eq('item_id', item_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
