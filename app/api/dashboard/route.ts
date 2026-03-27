import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabase.rpc('get_dashboard_data').limit(10000);
    if (error) throw new Error(error.message);

    return NextResponse.json(data ?? [], {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
