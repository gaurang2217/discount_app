import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { manufacture_name, month, amount_due, amount_received, received_date, notes } = body;

  if (!manufacture_name || !month) {
    return NextResponse.json({ error: 'manufacture_name and month are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('sponsorship_receipts')
    .upsert(
      {
        manufacture_name,
        month,
        amount_due: Number(amount_due) || 0,
        amount_received: amount_received !== undefined && amount_received !== '' ? Number(amount_received) : null,
        received_date: received_date || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'manufacture_name,month' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
