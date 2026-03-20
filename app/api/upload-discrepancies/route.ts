import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { invalidateMappingCache } from '@/lib/applyMappings';

export async function GET() {
  const { data: discrepancies, error } = await supabase
    .from('upload_discrepancies')
    .select('id, upload_batch, item_id, item_name, grn_no, grn_date, uploaded_manufacture_name, existing_manufacture_name, status, resolved_to, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pending = (discrepancies ?? []).filter(d => d.status === 'pending').length;

  return NextResponse.json({ discrepancies: discrepancies ?? [], pending_count: pending });
}

export async function POST(req: NextRequest) {
  const { id, action, resolved_to } = await req.json() as {
    id: number;
    action: 'approve_uploaded' | 'approve_existing' | 'approve_custom';
    resolved_to?: string;
  };

  if (!id || !action) return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });

  const { data: disc, error: fetchError } = await supabase
    .from('upload_discrepancies')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!disc) return NextResponse.json({ error: 'Discrepancy not found' }, { status: 404 });
  if (disc.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 400 });

  let finalName: string;
  if (action === 'approve_uploaded') {
    finalName = disc.uploaded_manufacture_name;
  } else if (action === 'approve_existing') {
    finalName = disc.existing_manufacture_name;
  } else if (action === 'approve_custom' && resolved_to) {
    finalName = resolved_to;
  } else {
    return NextResponse.json({ error: 'Invalid action or missing resolved_to' }, { status: 400 });
  }

  // Update the grn_item's manufacturer
  const { error: grnUpdateError } = await supabase
    .from('grn_items')
    .update({ manufacture_name: finalName })
    .eq('grn_no', disc.grn_no)
    .eq('item_id', disc.item_id);
  if (grnUpdateError) return NextResponse.json({ error: grnUpdateError.message }, { status: 500 });

  // Save manufacturer mapping so future uploads auto-apply
  if (action === 'approve_uploaded' || action === 'approve_custom') {
    const { error: mappingError } = await supabase
      .from('manufacturer_mappings')
      .upsert(
        { from_name: disc.existing_manufacture_name, to_name: finalName, updated_at: new Date().toISOString() },
        { onConflict: 'from_name' }
      );
    if (mappingError) console.error('Mapping upsert error:', mappingError.message);
  }

  // Mark discrepancy as resolved
  const { error: resolveError } = await supabase
    .from('upload_discrepancies')
    .update({ status: 'resolved', resolved_to: finalName })
    .eq('id', id);
  if (resolveError) return NextResponse.json({ error: resolveError.message }, { status: 500 });

  invalidateMappingCache();

  return NextResponse.json({ success: true, resolved_to: finalName });
}
