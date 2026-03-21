import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.rpc('get_manufacturers_summary').limit(10000);

  if (error) {
    console.error('get_manufacturers_summary error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  });
}
