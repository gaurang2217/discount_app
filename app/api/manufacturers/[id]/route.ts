import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mfr = decodeURIComponent(id);

  const [
    { data: monthly, error: monthlyError },
    { data: ratesData, error: ratesError },
    { data: companyRateData, error: companyRateError },
    { data: receiptsData, error: receiptsError },
  ] = await Promise.all([
    supabase.rpc('get_manufacturer_monthly', { p_mfr: mfr }).limit(10000) as any,
    supabase.from('sponsorship_rates').select('item_id, item_name, rate_pct, effective_from').eq('manufacture_name', mfr),
    supabase.from('manufacturer_rates').select('rate_pct, effective_from').eq('manufacture_name', mfr).maybeSingle(),
    supabase.from('sponsorship_receipts').select('month, amount_due, amount_received, received_date, notes').eq('manufacture_name', mfr).order('month', { ascending: false }),
  ]);

  if (monthlyError) {
    console.error('get_manufacturer_monthly error:', monthlyError);
    return NextResponse.json({ error: monthlyError.message }, { status: 500 });
  }
  if (ratesError) {
    console.error('sponsorship_rates fetch error:', ratesError);
    return NextResponse.json({ error: ratesError.message }, { status: 500 });
  }
  if (companyRateError) {
    console.error('manufacturer_rates fetch error:', companyRateError);
    return NextResponse.json({ error: companyRateError.message }, { status: 500 });
  }
  if (receiptsError) {
    console.error('sponsorship_receipts fetch error:', receiptsError);
    return NextResponse.json({ error: receiptsError.message }, { status: 500 });
  }

  return NextResponse.json({
    monthly: monthly ?? [],
    rates: ratesData ?? [],
    receipts: receiptsData ?? [],
    companyRate: companyRateData ?? null,
  }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  });
}
