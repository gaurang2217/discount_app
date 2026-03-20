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

  const { error } = await supabase
    .from('manufacturer_rates')
    .upsert(
      {
        manufacture_name,
        rate_pct: Number(rate_pct) || 0,
        effective_from: effective_from || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'manufacture_name' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
