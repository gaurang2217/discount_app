import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { invalidateMappingCache } from '@/lib/applyMappings';

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Token overlap
  const tokensA = new Set(na.split(/\s+/).filter(Boolean));
  const tokensB = new Set(nb.split(/\s+/).filter(Boolean));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

export async function GET() {
  // Legacy = grn_no starts with 'G.' (old system format)
  const { data: legacyData, error: legacyError } = await supabase
    .from('grn_items')
    .select('manufacture_name, grn_no, grn_date')
    .like('grn_no', 'G.%')
    .neq('manufacture_name', '');

  if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });

  // Aggregate legacy names
  const legacyMap = new Map<string, { record_count: number; first_date: string; last_date: string }>();
  for (const row of legacyData ?? []) {
    const existing = legacyMap.get(row.manufacture_name);
    if (existing) {
      existing.record_count++;
      if (row.grn_date && (!existing.first_date || row.grn_date < existing.first_date)) existing.first_date = row.grn_date;
      if (row.grn_date && (!existing.last_date || row.grn_date > existing.last_date)) existing.last_date = row.grn_date;
    } else {
      legacyMap.set(row.manufacture_name, {
        record_count: 1,
        first_date: row.grn_date ?? '',
        last_date: row.grn_date ?? '',
      });
    }
  }

  const legacyNames = [...legacyMap.entries()].map(([manufacture_name, stats]) => ({
    manufacture_name,
    ...stats,
  })).sort((a, b) => a.manufacture_name.localeCompare(b.manufacture_name));

  // New system names
  const { data: newData, error: newError } = await supabase
    .from('grn_items')
    .select('manufacture_name')
    .not('grn_no', 'like', 'G.%')
    .neq('manufacture_name', '');

  if (newError) return NextResponse.json({ error: newError.message }, { status: 500 });

  const newNameSet = new Set((newData ?? []).map((r: { manufacture_name: string }) => r.manufacture_name));
  const newNameList = [...newNameSet].sort();

  // For each legacy name, find best match in new names
  const suggestions = legacyNames.map(leg => {
    const name = leg.manufacture_name;

    // Already exists in new system exactly
    if (newNameSet.has(name)) {
      return { legacy_name: name, suggested_name: name, confidence: 'exact', record_count: leg.record_count, first_date: leg.first_date, last_date: leg.last_date };
    }

    // Find best match
    let bestScore = 0;
    let bestMatch = '';
    for (const newName of newNameList) {
      const score = similarity(name, newName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = newName;
      }
    }

    let confidence: 'exact' | 'high' | 'low' | 'none';
    if (bestScore >= 0.85) confidence = 'high';
    else if (bestScore >= 0.4) confidence = 'low';
    else confidence = 'none';

    return {
      legacy_name: name,
      suggested_name: bestScore > 0.3 ? bestMatch : '',
      confidence,
      score: bestScore,
      record_count: leg.record_count,
      first_date: leg.first_date,
      last_date: leg.last_date,
    };
  });

  return NextResponse.json({ suggestions, new_names: newNameList });
}

export async function POST(req: NextRequest) {
  const { mappings } = await req.json() as {
    mappings: { legacy_name: string; new_name: string }[];
  };

  if (!mappings?.length) return NextResponse.json({ error: 'No mappings provided' }, { status: 400 });

  let totalUpdated = 0;

  for (const { legacy_name, new_name } of mappings) {
    if (!legacy_name || !new_name || legacy_name === new_name) continue;

    // Update grn_items
    const { data: updatedItems, error: updateItemsError } = await supabase
      .from('grn_items')
      .update({ manufacture_name: new_name })
      .eq('manufacture_name', legacy_name)
      .select('id');
    if (updateItemsError) {
      console.error('grn_items update error:', updateItemsError);
      return NextResponse.json({ error: updateItemsError.message }, { status: 500 });
    }
    totalUpdated += updatedItems?.length ?? 0;

    // Copy sponsorship rates from legacy to new (ignore conflicts)
    const { data: existingRates } = await supabase
      .from('sponsorship_rates')
      .select('*')
      .eq('manufacture_name', legacy_name);

    if (existingRates && existingRates.length > 0) {
      const newRates = existingRates.map((r: Record<string, unknown>) => ({
        manufacture_name: new_name,
        item_id: r.item_id,
        item_name: r.item_name,
        rate_pct: r.rate_pct,
        effective_from: r.effective_from,
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .from('sponsorship_rates')
        .upsert(newRates, { onConflict: 'manufacture_name,item_id', ignoreDuplicates: true });

      // Delete old rates for legacy_name if not in grn_items anymore
      const { data: stillUsed } = await supabase
        .from('grn_items')
        .select('manufacture_name')
        .eq('manufacture_name', legacy_name)
        .limit(1);
      if (!stillUsed || stillUsed.length === 0) {
        await supabase
          .from('sponsorship_rates')
          .delete()
          .eq('manufacture_name', legacy_name);
      }
    }

    // Save mapping for future uploads
    await supabase
      .from('manufacturer_mappings')
      .upsert(
        { from_name: legacy_name, to_name: new_name, updated_at: new Date().toISOString() },
        { onConflict: 'from_name' }
      );
  }

  invalidateMappingCache();

  return NextResponse.json({ success: true, records_updated: totalUpdated });
}
