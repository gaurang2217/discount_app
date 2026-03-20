import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { item_id, old_manufacture_name, new_manufacture_name } = await req.json();

  if (!item_id || !old_manufacture_name || !new_manufacture_name) {
    return NextResponse.json({ error: 'item_id, old_manufacture_name and new_manufacture_name are required' }, { status: 400 });
  }

  if (old_manufacture_name === new_manufacture_name) {
    return NextResponse.json({ error: 'New manufacturer is the same as current' }, { status: 400 });
  }

  // Update all grn_items for this item_id + old manufacturer
  const { data: updatedRows, error: updateError } = await supabase
    .from('grn_items')
    .update({ manufacture_name: new_manufacture_name })
    .eq('item_id', item_id)
    .eq('manufacture_name', old_manufacture_name)
    .select('id');

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Move sponsorship rate if it exists
  const { error: rateError } = await supabase
    .from('sponsorship_rates')
    .update({ manufacture_name: new_manufacture_name })
    .eq('item_id', item_id)
    .eq('manufacture_name', old_manufacture_name);

  if (rateError) console.error('sponsorship_rates update error:', rateError.message);

  return NextResponse.json({ success: true, rows_updated: updatedRows?.length ?? 0 });
}
