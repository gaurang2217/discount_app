import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mfr = searchParams.get('manufacture_name');

  let query = supabase
    .from('rate_change_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(1000);

  if (mfr) query = query.eq('manufacture_name', mfr);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
