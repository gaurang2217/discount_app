import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mfr = searchParams.get('manufacture_name');

  if (mfr) {
    const { data, error } = await supabase
      .from('manufacturer_rates')
      .select('*')
      .eq('manufacture_name', mfr)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? null);
  }

  const { data, error } = await supabase
    .from('manufacturer_rates')
    .select('*')
    .order('manufacture_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { manufacture_name, rate_pct, effective_from } = await req.json();

  if (!manufacture_name) {
    return NextResponse.json({ error: 'manufacture_name is required' }, { status: 400 });
  }

  // Fetch existing rate for audit log
  const { data: existing } = await supabase
    .from('manufacturer_rates')
    .select('rate_pct, effective_from')
    .eq('manufacture_name', manufacture_name)
    .maybeSingle();

  const newRate = Number(rate_pct) || 0;

  const { error } = await supabase
    .from('manufacturer_rates')
    .upsert(
      { manufacture_name, rate_pct: newRate, effective_from: effective_from || null, updated_at: new Date().toISOString() },
      { onConflict: 'manufacture_name' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log change if rate actually changed or is new
  if (!existing || existing.rate_pct !== newRate || existing.effective_from !== (effective_from || null)) {
    await supabase.from('rate_change_log').insert({
      change_type: 'company_rate',
      manufacture_name,
      old_rate_pct: existing?.rate_pct ?? null,
      new_rate_pct: newRate,
      old_effective_from: existing?.effective_from ?? null,
      new_effective_from: effective_from || null,
      changed_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { manufacture_name } = await req.json();

  const { error } = await supabase
    .from('manufacturer_rates')
    .delete()
    .eq('manufacture_name', manufacture_name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
